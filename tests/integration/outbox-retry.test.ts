import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresExchange, TransactionRetriesExhausted, type Pool } from '@shinrai/adapters';
import { agent, cmd, MARKET_ID, marketDefinition, operator } from '../support/commands';
import { counts, freshDatabase } from '../support/pg';

let pool: Pool;
let ex: PostgresExchange;
const serializationFailure = () =>
  Object.assign(new Error('could not serialize access'), { code: '40001' });

beforeAll(async () => {
  ({ pool } = await freshDatabase());
  ex = new PostgresExchange(pool);
  await ex.execute(cmd(operator, { type: 'OpenMarket', market: marketDefinition }));
  await ex.execute(cmd(operator, { type: 'GrantCredits', ownerId: 'alice', amount: 10_000 }));
});
afterAll(() => pool?.end());

const order = (key: string, quantity = 5) =>
  cmd(
    agent('alice'),
    { type: 'PlaceOrder', marketId: MARKET_ID, outcome: 'YES', price: 50, quantity },
    key,
    `corr-${key}`,
  );

describe('transactional outbox', () => {
  it('commits exactly one outbox event with the command facts', async () => {
    const r = await ex.execute(order('outbox-key-01'));
    expect(r.status).toBe('accepted');
    const rows = await pool.query(
      `SELECT type, published_at FROM outbox_events WHERE correlation_id = 'corr-outbox-key-01'`,
    );
    expect(rows.rows).toEqual([{ type: 'order.placed', published_at: null }]);
  });

  it('a rolled-back command leaves no outbox event and no facts at all', async () => {
    const before = await counts(pool);
    const failing = new PostgresExchange(pool, {
      beforeCommit: () => {
        throw new Error('process crashed before commit');
      },
    });
    await expect(failing.execute(order('outbox-key-02'))).rejects.toThrow('crashed');
    expect(await counts(pool)).toEqual(before);
  });

  it('publishes nothing for a rejection except the rejection fact', async () => {
    const before = await counts(pool);
    const r = await ex.execute(order('outbox-key-03', 100_000));
    expect(r).toMatchObject({ status: 'rejected', code: 'INSUFFICIENT_CREDITS' });
    const after = await counts(pool);
    expect(after).toEqual({
      ...before,
      outbox_events: before.outbox_events + 1,
      audit_log: before.audit_log + 1,
      idempotency_keys: before.idempotency_keys + 1,
    });
  });
});

describe('serializable retries', () => {
  it('retries a transient serialization failure and returns the original idempotent result', async () => {
    const attempts: number[] = [];
    const flaky = new PostgresExchange(pool, {
      backoffMs: () => 1,
      beforeCommit: (attempt) => {
        attempts.push(attempt);
        if (attempt === 1) throw serializationFailure();
      },
    });
    const first = await flaky.execute(order('retry-key-01'));
    expect(attempts).toEqual([1, 2]);
    expect(first.status).toBe('accepted');

    const again = await ex.execute(order('retry-key-01'));
    expect(again).toEqual({ ...first, replayed: true });
    const n = await pool.query(
      `SELECT count(*)::int AS n FROM orders WHERE correlation_id = 'corr-retry-key-01'`,
    );
    expect(n.rows[0].n).toBe(1);
  });

  it('gives up after the attempt budget without writing anything', async () => {
    const before = await counts(pool);
    const stuck = new PostgresExchange(pool, {
      maxAttempts: 3,
      backoffMs: () => 1,
      beforeCommit: () => {
        throw serializationFailure();
      },
    });
    await expect(stuck.execute(order('retry-key-02'))).rejects.toBeInstanceOf(
      TransactionRetriesExhausted,
    );
    expect(await counts(pool)).toEqual(before);
  });

  it('two racers with one idempotency key produce one order and one shared answer', async () => {
    const [a, b] = await Promise.all([
      ex.execute(order('race-key-01')),
      ex.execute(order('race-key-01')),
    ]);
    expect(a.status).toBe('accepted');
    expect({ ...a, replayed: false }).toEqual({ ...b, replayed: false });
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
  });
});
