import { describe, expect, it } from 'vitest';
import { escrowAccount } from '@shinrai/domain';
import { agent, cmd, MARKET_ID, operator } from '../support/commands';
import { seededExchange } from '../support/memory';

async function tradedMarket() {
  const ex = await seededExchange();
  await ex.execute(
    cmd(agent('bob'), {
      type: 'PlaceOrder',
      marketId: MARKET_ID,
      outcome: 'NO',
      price: 42,
      quantity: 30,
    }),
  );
  await ex.execute(
    cmd(agent('alice'), {
      type: 'PlaceOrder',
      marketId: MARKET_ID,
      outcome: 'YES',
      price: 58,
      quantity: 50,
    }),
  );
  return ex; // 30 matched at 58/42; alice has 20 YES resting
}

const resolve = (winningOutcome: 'YES' | 'NO', key?: string, actor = operator) =>
  cmd(
    actor,
    { type: 'ResolveMarket', marketId: MARKET_ID, winningOutcome, source: 'fixture:final-score' },
    key,
  );

describe('settlement', () => {
  it('pays 100 per winning contract, drains escrow and releases open reservations', async () => {
    const ex = await tradedMarket();
    const r = await ex.execute(resolve('YES', 'resolve-key-01'));
    expect(r.status).toBe('accepted');

    const alice = await ex.getPortfolio('demo', 'alice');
    const bob = await ex.getPortfolio('demo', 'bob');
    expect(alice.available).toBe(10_000 - 30 * 58 + 30 * 100);
    expect(bob.available).toBe(10_000 - 30 * 42);
    expect(alice.reserved + bob.reserved).toBe(0);
    expect(alice.openOrders).toEqual([]);
    expect(ex.tenant('demo').balances.get(escrowAccount(MARKET_ID))).toBe(0);
  });

  it('settles exactly once even when retried with a new key', async () => {
    const ex = await tradedMarket();
    const first = await ex.execute(resolve('YES', 'resolve-key-01'));
    const snapshot = structuredClone(ex.tenant('demo').balances);
    const retrySameKey = await ex.execute(resolve('YES', 'resolve-key-01'));
    const retryNewKey = await ex.execute(resolve('YES', 'resolve-key-02'));

    expect(retrySameKey).toEqual({ ...first, replayed: true });
    expect(
      retryNewKey.status === 'accepted' && first.status === 'accepted' && retryNewKey.event.eventId,
    ).toBe(first.status === 'accepted' && first.event.eventId);
    expect(ex.tenant('demo').balances).toEqual(snapshot);
    expect(ex.tenant('demo').ledger.filter((t) => t.reason === 'settle')).toHaveLength(1);
  });

  it('refuses a conflicting second resolution', async () => {
    const ex = await tradedMarket();
    await ex.execute(resolve('YES'));
    expect(await ex.execute(resolve('NO'))).toMatchObject({
      status: 'rejected',
      code: 'RESOLUTION_CONFLICT',
    });
  });

  it('closes the market to new orders', async () => {
    const ex = await tradedMarket();
    await ex.execute(resolve('NO'));
    const late = await ex.execute(
      cmd(agent('alice'), {
        type: 'PlaceOrder',
        marketId: MARKET_ID,
        outcome: 'YES',
        price: 10,
        quantity: 1,
      }),
    );
    expect(late).toMatchObject({ status: 'rejected', code: 'MARKET_NOT_OPEN' });
  });

  it('never lets an agent resolve, open markets or mint credits', async () => {
    const ex = await tradedMarket();
    expect(await ex.execute(resolve('YES', undefined, agent('alice')))).toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(
      await ex.execute(cmd(agent('alice'), { type: 'GrantCredits', ownerId: 'alice', amount: 1 })),
    ).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets only the owner cancel, and cancelling releases the reservation', async () => {
    const ex = await tradedMarket();
    const open = (await ex.getPortfolio('demo', 'alice')).openOrders[0];
    if (!open) throw new Error('expected a resting order');
    expect(
      await ex.execute(cmd(agent('bob'), { type: 'CancelOrder', orderId: open.orderId })),
    ).toMatchObject({ code: 'FORBIDDEN' });
    expect(
      (await ex.execute(cmd(agent('alice'), { type: 'CancelOrder', orderId: open.orderId })))
        .status,
    ).toBe('accepted');
    expect((await ex.getPortfolio('demo', 'alice')).reserved).toBe(0);
    expect(
      await ex.execute(cmd(agent('alice'), { type: 'CancelOrder', orderId: open.orderId })),
    ).toMatchObject({
      code: 'ORDER_NOT_CANCELLABLE',
    });
  });
});
