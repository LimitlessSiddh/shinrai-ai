import { describe, expect, it } from 'vitest';
import type { CommandResult, Order } from '@shinrai/contracts';
import { escrowAccount } from '@shinrai/domain';
import { agent, cmd, MARKET_ID } from '../support/commands';
import { seededExchange } from '../support/memory';

const place = (owner: string, outcome: 'YES' | 'NO', price: number, quantity: number) =>
  cmd(agent(owner), { type: 'PlaceOrder', marketId: MARKET_ID, outcome, price, quantity });

const placed = (r: CommandResult) => {
  if (r.status !== 'accepted' || r.event.type !== 'order.placed')
    throw new Error(`expected order.placed, got ${JSON.stringify(r)}`);
  return r.event.payload;
};

describe('matching', () => {
  it('rests an order that does not cross', async () => {
    const ex = await seededExchange();
    placed(await ex.execute(place('bob', 'NO', 40, 10)));
    const p = placed(await ex.execute(place('alice', 'YES', 58, 10))); // 58 + 40 < 100
    expect(p.fills).toEqual([]);
    expect(p.order).toMatchObject({ status: 'open', filledQuantity: 0, reservedRemaining: 580 });
  });

  it('fills best price first, then oldest sequence (price-time priority)', async () => {
    const ex = await seededExchange({
      alice: 100_000,
      bob: 100_000,
      carol: 100_000,
      dave: 100_000,
    });
    const b = placed(await ex.execute(place('bob', 'NO', 42, 10))).order;
    const c = placed(await ex.execute(place('carol', 'NO', 42, 10))).order;
    const d = placed(await ex.execute(place('dave', 'NO', 45, 10))).order;

    const p = placed(await ex.execute(place('alice', 'YES', 58, 25)));
    expect(p.fills.map((f) => [f.makerOrderId, f.quantity, f.yesPrice])).toEqual([
      [d.orderId, 10, 55], // highest NO bid = cheapest YES
      [b.orderId, 10, 58], // tie at 42: older sequence first
      [c.orderId, 5, 58],
    ]);
    expect(p.order).toMatchObject({ status: 'filled', filledQuantity: 25, reservedRemaining: 0 });
  });

  it('partially fills and leaves the remainder resting with its reservation', async () => {
    const ex = await seededExchange();
    placed(await ex.execute(place('bob', 'NO', 42, 20)));
    const p = placed(await ex.execute(place('alice', 'YES', 58, 50)));
    expect(p.fills).toHaveLength(1);
    expect(p.order).toMatchObject({
      status: 'open',
      filledQuantity: 20,
      reservedRemaining: 30 * 58,
    });
    const pf = await ex.getPortfolio('demo', 'alice');
    expect(pf.reserved).toBe(30 * 58);
    expect(pf.positions).toEqual([
      { ownerId: 'alice', marketId: MARKET_ID, outcome: 'YES', quantity: 20, cost: 20 * 58 },
    ]);
  });

  it('executes at the maker price and refunds the taker improvement', async () => {
    const ex = await seededExchange();
    placed(await ex.execute(place('bob', 'NO', 45, 10)));
    placed(await ex.execute(place('alice', 'YES', 60, 10)));
    const alice = await ex.getPortfolio('demo', 'alice');
    expect(alice.available).toBe(10_000 - 55 * 10);
    expect(alice.reserved).toBe(0);
    expect(ex.tenant('demo').balances.get(escrowAccount(MARKET_ID))).toBe(100 * 10);
  });

  it('is deterministic: the same commands produce identical events', async () => {
    const run = async () => {
      const ex = await seededExchange({ a: 50_000, b: 50_000, c: 50_000 });
      const script: [string, 'YES' | 'NO', number, number][] = [
        ['a', 'NO', 41, 7],
        ['b', 'NO', 44, 3],
        ['c', 'YES', 57, 4],
        ['a', 'YES', 60, 9],
        ['b', 'NO', 50, 12],
      ];
      for (const [o, side, price, qty] of script) await ex.execute(place(o, side, price, qty));
      return JSON.stringify(
        ex.tenant('demo').events.map(({ eventId, type, payload }) => ({ eventId, type, payload })),
      );
    };
    const first = await run();
    expect(await run()).toBe(first);
  });

  it('never lets escrow differ from 100 per matched pair', async () => {
    const ex = await seededExchange({ a: 50_000, b: 50_000 });
    for (const [o, s, p, q] of [
      ['a', 'NO', 30, 5],
      ['b', 'YES', 75, 3],
      ['b', 'YES', 70, 9],
      ['a', 'NO', 35, 4],
    ] as const) {
      await ex.execute(place(o, s, p, q));
    }
    const t = ex.tenant('demo');
    const matched = t.fills.reduce((s, f) => s + f.quantity, 0);
    expect(t.balances.get(escrowAccount(MARKET_ID))).toBe(100 * matched);
    const open = [...t.orders.values()].filter((o: Order) => o.status === 'open');
    const reserved = (id: string) => t.balances.get(`agent:${id}:reserved`) ?? 0;
    expect(reserved('a') + reserved('b')).toBe(open.reduce((s, o) => s + o.reservedRemaining, 0));
  });
});
