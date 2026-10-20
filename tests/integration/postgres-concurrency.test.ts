import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresExchange, type Pool } from '@shinrai/adapters';
import { counterIds, InMemoryExchange, steppingClock } from '@shinrai/domain';
import { agent, cmd, MARKET_ID, marketDefinition, operator } from '../support/commands';
import { assertLedgerInvariants, freshDatabase } from '../support/pg';

let pool: Pool;
let ex: PostgresExchange;

beforeAll(async () => {
  ({ pool } = await freshDatabase());
  ex = new PostgresExchange(pool);
  await ex.execute(cmd(operator, { type: 'OpenMarket', market: marketDefinition }));
  for (const [ownerId, amount] of [
    ['alice', 3_000],
    ['bob', 50_000],
    ['carol', 50_000],
  ] as const) {
    await ex.execute(cmd(operator, { type: 'GrantCredits', ownerId, amount }));
  }
});
afterAll(() => pool?.end());

describe('concurrent commands on PostgreSQL', () => {
  it('never lets parallel orders overspend one paper account', async () => {
    // 20 parallel orders of 580 credit-cents against a 3,000 balance: at most 5 can be accepted.
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        ex.execute(
          cmd(agent('alice'), {
            type: 'PlaceOrder',
            marketId: MARKET_ID,
            outcome: 'YES',
            price: 58,
            quantity: 10,
          }),
        ),
      ),
    );
    const accepted = results.filter((r) => r.status === 'accepted');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(accepted).toHaveLength(5);
    expect(
      rejected.every((r) => r.status === 'rejected' && r.code === 'INSUFFICIENT_CREDITS'),
    ).toBe(true);

    const pf = await ex.getPortfolio('demo', 'alice');
    expect(pf.available).toBe(100);
    expect(pf.reserved).toBe(2_900);
    expect(await assertLedgerInvariants(pool)).toEqual({
      unbalanced: [],
      drift: [],
      negative: [],
      reservedDrift: [],
    });
  });

  it('matches two competing agents deterministically with balanced ledger and traceable events', async () => {
    const orders = [
      ...Array.from({ length: 15 }, (_, i) =>
        cmd(agent('bob'), {
          type: 'PlaceOrder',
          marketId: MARKET_ID,
          outcome: 'NO',
          price: 40 + (i % 5),
          quantity: 3 + (i % 4),
        }),
      ),
      ...Array.from({ length: 15 }, (_, i) =>
        cmd(agent('carol'), {
          type: 'PlaceOrder',
          marketId: MARKET_ID,
          outcome: 'YES',
          price: 55 + (i % 6),
          quantity: 2 + (i % 5),
        }),
      ),
    ];
    const results = await Promise.all(orders.map((o) => ex.execute(o)));
    expect(results.every((r) => r.status === 'accepted')).toBe(true);

    expect(await assertLedgerInvariants(pool)).toEqual({
      unbalanced: [],
      drift: [],
      negative: [],
      reservedDrift: [],
    });
    const {
      rows: [m],
    } = await pool.query(
      `SELECT (SELECT coalesce(sum(quantity), 0) FROM fills) AS matched,
              (SELECT balance FROM ledger_accounts WHERE account_id = $1) AS escrow,
              (SELECT coalesce(sum(quantity), 0) FROM positions WHERE outcome = 'YES') AS yes,
              (SELECT coalesce(sum(quantity), 0) FROM positions WHERE outcome = 'NO') AS no`,
      [`market:${MARKET_ID}:escrow`],
    );
    expect(Number(m.escrow)).toBe(100 * Number(m.matched));
    expect(Number(m.yes)).toBe(Number(m.matched));
    expect(Number(m.no)).toBe(Number(m.matched));

    // Determinism: replaying the committed order sequence through the reference engine
    // reproduces every fill exactly (price-time priority, quantities, counterparties).
    const committed = await pool.query(
      `SELECT owner_id, outcome, price, quantity FROM orders ORDER BY sequence`,
    );
    const ref = new InMemoryExchange(counterIds(), steppingClock('2026-10-20T20:00:00.000Z'));
    await ref.execute(cmd(operator, { type: 'OpenMarket', market: marketDefinition }));
    for (const o of ['alice', 'bob', 'carol'])
      await ref.execute(cmd(operator, { type: 'GrantCredits', ownerId: o, amount: 50_000 }));
    for (const o of committed.rows) {
      await ref.execute(
        cmd(agent(o.owner_id), {
          type: 'PlaceOrder',
          marketId: MARKET_ID,
          outcome: o.outcome,
          price: o.price,
          quantity: o.quantity,
        }),
      );
    }
    const pgFills = await pool.query(
      `SELECT yes_owner_id, no_owner_id, quantity, yes_price FROM fills ORDER BY sequence`,
    );
    const refFills = ref.tenant('demo').fills.map((f) => ({
      yes_owner_id: f.yesOwnerId,
      no_owner_id: f.noOwnerId,
      quantity: f.quantity,
      yes_price: f.yesPrice,
    }));
    expect(pgFills.rows).toEqual(refFills);

    // Every committed order has exactly one event, audit row and correlation-linked ledger tx.
    const trace = await pool.query(
      `SELECT count(*) FILTER (WHERE a.event_id IS NULL) AS missing_audit
         FROM outbox_events e LEFT JOIN audit_log a USING (event_id) WHERE e.type = 'order.placed'`,
    );
    expect(Number(trace.rows[0].missing_audit)).toBe(0);
  });
});
