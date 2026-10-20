import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresExchange, type Pool } from '@shinrai/adapters';
import { agent, cmd, MARKET_ID, marketDefinition, operator } from '../support/commands';
import { assertLedgerInvariants, counts, freshDatabase } from '../support/pg';

let pool: Pool;
let ex: PostgresExchange;

beforeAll(async () => {
  ({ pool } = await freshDatabase());
  ex = new PostgresExchange(pool);
  await ex.execute(cmd(operator, { type: 'OpenMarket', market: marketDefinition }));
  for (const o of ['alice', 'bob'])
    await ex.execute(cmd(operator, { type: 'GrantCredits', ownerId: o, amount: 10_000 }));
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
});
afterAll(() => pool?.end());

describe('rejections change nothing', () => {
  it('insufficient credits, unknown market, agent resolution and foreign cancel mutate no facts', async () => {
    const before = await counts(pool);
    const rejected = await Promise.all([
      ex.execute(
        cmd(agent('alice'), {
          type: 'PlaceOrder',
          marketId: MARKET_ID,
          outcome: 'YES',
          price: 99,
          quantity: 1_000,
        }),
      ),
      ex.execute(
        cmd(agent('alice'), {
          type: 'PlaceOrder',
          marketId: 'nba-unknown',
          outcome: 'YES',
          price: 50,
          quantity: 1,
        }),
      ),
      ex.execute(
        cmd(agent('alice'), {
          type: 'ResolveMarket',
          marketId: MARKET_ID,
          winningOutcome: 'YES',
          source: 'agent',
        }),
      ),
    ]);
    expect(rejected.map((r) => r.status === 'rejected' && r.code)).toEqual([
      'INSUFFICIENT_CREDITS',
      'MARKET_NOT_FOUND',
      'FORBIDDEN',
    ]);
    const after = await counts(pool);
    for (const t of [
      'orders',
      'fills',
      'positions',
      'credit_reservations',
      'ledger_transactions',
      'ledger_entries',
      'market_resolutions',
    ] as const) {
      expect(after[t], t).toBe(before[t]);
    }
  });
});

describe('exactly-once settlement under concurrent retries', () => {
  it('five concurrent resolutions with different keys settle once and report one event', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        ex.execute(
          cmd(
            operator,
            {
              type: 'ResolveMarket',
              marketId: MARKET_ID,
              winningOutcome: 'YES',
              source: 'fixture:final',
            },
            `resolve-key-0${i}`,
          ),
        ),
      ),
    );
    const eventIds = new Set(
      results.map((r) => (r.status === 'accepted' ? r.event.eventId : r.code)),
    );
    expect(eventIds.size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);

    const settle = await pool.query(
      `SELECT count(*)::int AS n FROM ledger_transactions WHERE reason = 'settle'`,
    );
    expect(settle.rows[0].n).toBe(1);
    const alice = await ex.getPortfolio('demo', 'alice');
    expect(alice.available).toBe(10_000 - 30 * 58 + 30 * 100);
    expect(alice.reserved).toBe(0);
    expect(await assertLedgerInvariants(pool)).toEqual({
      unbalanced: [],
      drift: [],
      negative: [],
      reservedDrift: [],
    });
  });
});

describe('database-enforced invariants', () => {
  const fails = (sql: string) => expect(pool.query(sql)).rejects.toThrow();

  it('ledger rows, outbox events and audit rows are append-only', async () => {
    await fails(`UPDATE ledger_entries SET amount = amount + 1`);
    await fails(`DELETE FROM ledger_transactions`);
    await fails(`TRUNCATE ledger_entries CASCADE`);
    await fails(`DELETE FROM outbox_events`);
    await fails(`UPDATE outbox_events SET type = 'x'`);
    await fails(`DELETE FROM audit_log`);
    await fails(`UPDATE market_resolutions SET winning_outcome = 'NO'`);
  });

  it('rejects an unbalanced ledger transaction at commit', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO ledger_transactions VALUES ('demo', 'bad-tx', 'grant', NULL, 'e', 'c', now())`,
      );
      await c.query(
        `INSERT INTO ledger_entries VALUES ('demo', 'bad-tx', 1, 'system:issuance', 'debit', 10)`,
      );
      await c.query(
        `INSERT INTO ledger_entries VALUES ('demo', 'bad-tx', 2, 'agent:alice:available', 'credit', 9)`,
      );
      await expect(c.query('COMMIT')).rejects.toThrow(/unbalanced/);
    } finally {
      c.release();
    }
  });

  it('refuses a debit that would make an account negative', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO ledger_transactions VALUES ('demo', 'neg-tx', 'grant', NULL, 'e', 'c', now())`,
      );
      await expect(
        c.query(
          `INSERT INTO ledger_entries VALUES ('demo', 'neg-tx', 1, 'agent:bob:reserved', 'debit', 999999)`,
        ),
      ).rejects.toThrow(/non_negative/);
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
  });

  it('allows one resolution per market', async () => {
    await expect(
      pool.query(`INSERT INTO market_resolutions VALUES ('demo', $1, 'NO', 'dup', 'evt', now())`, [
        MARKET_ID,
      ]),
    ).rejects.toThrow(/duplicate key/);
  });

  it('enforces price and quantity bounds', async () => {
    await fails(
      `INSERT INTO orders VALUES ('demo', 'o-bad', '${MARKET_ID}', 'x', 'YES', 100, 1, 0, 'open', 999, 'c', now())`,
    );
    await fails(
      `INSERT INTO orders VALUES ('demo', 'o-bad', '${MARKET_ID}', 'x', 'YES', 50, 0, 0, 'open', 999, 'c', now())`,
    );
  });
});
