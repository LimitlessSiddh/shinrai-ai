import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@shinrai/domain';
import { agent, cmd, MARKET_ID } from '../support/commands';
import { seededExchange } from '../support/memory';

describe('idempotency', () => {
  it('returns the original result for a repeated command and changes state once', async () => {
    const ex = await seededExchange();
    const order = cmd(
      agent('alice'),
      { type: 'PlaceOrder', marketId: MARKET_ID, outcome: 'YES', price: 58, quantity: 50 },
      'retry-key-0001',
    );
    const first = await ex.execute(order);
    const second = await ex.execute(structuredClone(order));

    expect(first.replayed).toBe(false);
    expect(second).toEqual({ ...first, replayed: true });
    const t = ex.tenant('demo');
    expect([...t.orders.values()]).toHaveLength(1);
    expect(t.ledger.filter((tx) => tx.reason === 'reserve')).toHaveLength(1);
    expect((await ex.getPortfolio('demo', 'alice')).reserved).toBe(58 * 50);
  });

  it('rejects the same key with a different request and changes nothing', async () => {
    const ex = await seededExchange();
    await ex.execute(
      cmd(
        agent('alice'),
        { type: 'PlaceOrder', marketId: MARKET_ID, outcome: 'YES', price: 58, quantity: 50 },
        'retry-key-0002',
      ),
    );
    const before = structuredClone(ex.tenant('demo'));
    const conflict = await ex.execute(
      cmd(
        agent('alice'),
        { type: 'PlaceOrder', marketId: MARKET_ID, outcome: 'YES', price: 59, quantity: 50 },
        'retry-key-0002',
      ),
    );
    expect(conflict).toMatchObject({ status: 'rejected', code: 'IDEMPOTENCY_CONFLICT' });
    expect(ex.tenant('demo')).toEqual(before);
  });

  it('scopes keys per actor, so two agents may use the same key', async () => {
    const ex = await seededExchange();
    const a = await ex.execute(
      cmd(
        agent('alice'),
        { type: 'PlaceOrder', marketId: MARKET_ID, outcome: 'YES', price: 40, quantity: 1 },
        'shared-key-01',
      ),
    );
    const b = await ex.execute(
      cmd(
        agent('bob'),
        { type: 'PlaceOrder', marketId: MARKET_ID, outcome: 'YES', price: 40, quantity: 1 },
        'shared-key-01',
      ),
    );
    expect(a.replayed || b.replayed).toBe(false);
    expect(ex.tenant('demo').orders.size).toBe(2);
  });

  it('replays a stored rejection instead of re-evaluating it', async () => {
    const ex = await seededExchange({ alice: 100 });
    const c = cmd(
      agent('alice'),
      { type: 'PlaceOrder', marketId: MARKET_ID, outcome: 'YES', price: 50, quantity: 10 },
      'reject-key-01',
    );
    const first = await ex.execute(c);
    const again = await ex.execute(c);
    expect(first).toMatchObject({ status: 'rejected', code: 'INSUFFICIENT_CREDITS' });
    expect(again).toEqual({ ...first, replayed: true });
    expect(ex.tenant('demo').events.filter((e) => e.type === 'command.rejected')).toHaveLength(1);
  });

  it('fingerprints payloads independent of key order', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(
      canonicalJson({ a: [2, { c: 4, d: 3 }], b: 1 }),
    );
  });
});
