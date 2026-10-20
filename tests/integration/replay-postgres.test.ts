import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadFixture, rebuildProjections, runPersistedReplay, type Pool } from '@shinrai/adapters';
import { replayFixture } from '@shinrai/agent-tools';
import { memoryContext } from '../support/agent';
import { assertLedgerInvariants, freshDatabase } from '../support/pg';

let pool: Pool;
beforeAll(async () => {
  ({ pool } = await freshDatabase());
});
afterAll(() => pool?.end());

describe('fixture replay on PostgreSQL', () => {
  it('reproduces the in-memory reference report exactly, twice', async () => {
    const fixture = await loadFixture();
    const reference = await replayFixture((await memoryContext(fixture)).ctx);
    const first = await runPersistedReplay(pool, fixture, {
      tenantId: 'demo',
      correlationId: 'corr-replay-1',
    });
    const second = await runPersistedReplay(pool, fixture, {
      tenantId: 'demo',
      correlationId: 'corr-replay-2',
    });

    expect(first.replayTenant).not.toBe(second.replayTenant);
    expect(first.report).toEqual(reference.report);
    expect(first.hash).toBe(reference.hash);
    expect(second.hash).toBe(first.hash);
    expect(await assertLedgerInvariants(pool)).toEqual({
      unbalanced: [],
      drift: [],
      negative: [],
      reservedDrift: [],
    });
  });

  it('persists agent runs, tool calls, approvals and evaluation metrics', async () => {
    const q = async (sql: string) => (await pool.query(sql)).rows[0];
    const runs = await q(`SELECT count(*)::int AS n FROM agent_runs`);
    const calls = await q(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE policy_decision = 'blocked')::int AS blocked FROM agent_tool_calls`,
    );
    const approvals = await q(
      `SELECT count(*)::int AS n FROM approval_requests WHERE status = 'pending'`,
    );
    const metrics = await q(
      `SELECT value FROM evaluation_results WHERE metric = 'agent-research.brierScore' LIMIT 1`,
    );
    expect(runs.n).toBe(14);
    expect(calls.blocked).toBeGreaterThan(0);
    expect(approvals.n).toBe(2);
    expect(metrics.value).toBe(0.1296);
  });

  it('rebuilds projections including agent activity', async () => {
    const n = await rebuildProjections(pool);
    const a = await pool.query(
      `SELECT count(*)::int AS n FROM activity_feed WHERE status = 'blocked'`,
    );
    expect(n).toBeGreaterThan(0);
    expect(a.rows[0].n).toBeGreaterThan(0);
  });
});
