import { fixtureEvidence, replayFixture, type ReplayReport } from '@shinrai/agent-tools';
import type { Fixture } from '@shinrai/contracts';
import { counterIds, steppingClock } from '@shinrai/domain';
import { PgRunRecorder, registerFixture } from './postgres/agent-records';
import { PostgresExchange } from './postgres/exchange';
import type { Pool } from './postgres/pool';

export type StoredEvaluation = {
  evaluationId: string;
  replayTenant: string;
  report: ReplayReport;
  hash: string;
};

/**
 * Replays a fixture into a fresh tenant through the real PostgreSQL command path, then stores the
 * evaluation. Deterministic ids and clock mean every replay of one fixture yields the same report hash.
 */
export async function runPersistedReplay(
  pool: Pool,
  fixture: Fixture,
  opts: { tenantId: string; correlationId: string },
): Promise<StoredEvaluation> {
  const n =
    (
      await pool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM evaluation_runs WHERE fixture_version = $1',
        [fixture.manifest.fixtureVersion],
      )
    ).rows[0]?.n ?? 0;
  const replayTenant = `replay-${fixture.manifest.fixtureVersion}-${String(n + 1).padStart(4, '0')}`;
  const ids = counterIds(`${replayTenant}.`);
  const clock = steppingClock(fixture.manifest.replayStartsAt);
  await registerFixture(pool, replayTenant, fixture);
  const { report, hash } = await replayFixture({
    fixture,
    tenantId: replayTenant,
    exchange: new PostgresExchange(pool, { ids, clock, backoffMs: () => 0 }),
    recorder: new PgRunRecorder(pool),
    evidence: fixtureEvidence(fixture),
    ids,
    clock,
    keyPrefix: 'replay',
  });
  const evaluationId = `eval-${replayTenant}`;
  await pool.query(
    `INSERT INTO evaluation_runs (evaluation_id, tenant_id, fixture_version, replay_tenant, report, report_hash, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      evaluationId,
      opts.tenantId,
      fixture.manifest.fixtureVersion,
      replayTenant,
      report,
      hash,
      opts.correlationId,
    ],
  );
  for (const [agentId, r] of Object.entries(report.agents)) {
    for (const metric of [
      'brierScore',
      'logLoss',
      'paperPnl',
      'maxDrawdown',
      'policyAdherence',
      'policyViolations',
      'toolCallSuccessRate',
    ] as const) {
      await pool.query('INSERT INTO evaluation_results VALUES ($1, $2, $3)', [
        evaluationId,
        `${agentId}.${metric}`,
        r[metric],
      ]);
    }
  }
  return { evaluationId, replayTenant, report, hash };
}
