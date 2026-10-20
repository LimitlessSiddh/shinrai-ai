import {
  loadFixture,
  loadPolicy,
  OpenAIAgentsRunner,
  PgEvidence,
  PgRunRecorder,
  registerFixture,
  uuidIds,
  type Pool,
  type PostgresExchange,
} from '@shinrai/adapters';
import { runScenario, seedFixture, type ModelRunner } from '@shinrai/agent-tools';
import type { Principal, Scenario, ToolInput } from '@shinrai/contracts';
import { evaluateOrderPolicy, steppingClock, systemClock } from '@shinrai/domain';
import type { Config } from './config';
import { ApiError } from './http';

export type Services = { pool: Pool; exchange: PostgresExchange; config: Config };

const fixtureCtx = async (s: Services, tenantId: string, version: string, keyPrefix: string) => {
  const fixture = await loadFixture(version).catch(() => {
    throw new ApiError(404, 'FIXTURE_NOT_FOUND', `fixture ${version} not found`);
  });
  return {
    fixture,
    tenantId,
    exchange: s.exchange,
    recorder: new PgRunRecorder(s.pool),
    evidence: new PgEvidence(s.pool),
    ids: uuidIds,
    clock: systemClock,
    keyPrefix,
    // Real time for live runs; only scenarios that explicitly simulate a slow agent step the clock.
    runClock: (sc: Scenario) =>
      sc.clockStepSeconds > 1
        ? steppingClock(systemClock.now(), sc.clockStepSeconds * 1000)
        : systemClock,
  };
};

/** Registers and seeds a fixture into the principal's tenant. Safe to repeat (idempotency keys). */
export async function seed(s: Services, p: Principal, version: string) {
  const ctx = await fixtureCtx(s, p.tenantId, version, `seed-${p.tenantId}`);
  await registerFixture(s.pool, p.tenantId, ctx.fixture);
  await seedFixture(ctx);
  return { fixtureVersion: version, marketId: ctx.fixture.manifest.market.marketId };
}

/**
 * Starts one bounded agent run. The deterministic fake model replays the scenario script; the OpenAI
 * model is used only when explicitly configured, with a per-day run cap checked here first.
 */
export async function startRun(
  s: Services,
  p: Principal,
  body: { fixtureVersion: string; scenarioId: string; model: 'fake' | 'openai' },
  correlationId: string,
) {
  const ctx = await fixtureCtx(s, p.tenantId, body.fixtureVersion, `run-${p.tenantId}`);
  const scenario = ctx.fixture.scenarios.find((x) => x.scenarioId === body.scenarioId);
  if (!scenario)
    throw new ApiError(404, 'SCENARIO_NOT_FOUND', `scenario ${body.scenarioId} not found`);
  if (!(await loadPolicy(s.pool, p.tenantId, scenario.agentId))) {
    throw new ApiError(409, 'FIXTURE_NOT_SEEDED', 'seed the fixture before running agents');
  }

  let model: ModelRunner | undefined;
  if (body.model === 'openai') {
    if (!s.config.model.openaiEnabled)
      throw new ApiError(
        403,
        'MODEL_DISABLED',
        'real model runs are disabled (SHINRAI_MODEL=fake)',
      );
    const used = await s.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM agent_runs WHERE tenant_id = $1 AND model LIKE 'openai:%' AND started_at > now() - interval '1 day'`,
      [p.tenantId],
    );
    if ((used.rows[0]?.n ?? 0) >= s.config.model.maxRunsPerDay)
      throw new ApiError(429, 'MODEL_BUDGET_EXHAUSTED', 'daily real-model run cap reached');
    model = new OpenAIAgentsRunner({
      model: s.config.model.openaiModel,
      maxTurns: s.config.model.maxToolCalls,
    });
  }
  const { run, outcome } = await runScenario(ctx, scenario, model, correlationId);
  return {
    runId: run.runId,
    correlationId: run.correlationId,
    agentId: run.agentId,
    scenario: run.scenario,
    ...outcome,
  };
}

/** A human decision on an order held for approval. Approval re-runs policy, then the normal command path. */
export async function decideApproval(
  s: Services,
  p: Principal,
  approvalId: string,
  approve: boolean,
) {
  const r = await s.pool.query(
    `SELECT a.approval_id, a.status, a.request, a.created_at, r.run_id, r.agent_id, r.correlation_id, r.started_at
       FROM approval_requests a JOIN agent_runs r USING (tenant_id, run_id)
      WHERE a.tenant_id = $1 AND a.approval_id = $2`,
    [p.tenantId, approvalId],
  );
  const a = r.rows[0];
  if (!a) throw new ApiError(404, 'APPROVAL_NOT_FOUND', approvalId);
  if (a.status !== 'pending')
    throw new ApiError(409, 'APPROVAL_DECIDED', `approval already ${a.status}`);
  const mark = (status: string) =>
    s.pool.query(
      `UPDATE approval_requests SET status = $3, decided_by = $4, decided_at = now() WHERE tenant_id = $1 AND approval_id = $2 AND status = 'pending'`,
      [p.tenantId, approvalId, status, p.actorId],
    );
  if (!approve) {
    await mark('rejected');
    return { approvalId, status: 'rejected', result: null };
  }

  const policy = await loadPolicy(s.pool, p.tenantId, a.agent_id);
  if (!policy) throw new ApiError(409, 'POLICY_NOT_FOUND', a.agent_id);
  const req = a.request as ToolInput<'requestOrder'>;
  const committed = await s.pool.query<{ n: number }>(
    `SELECT coalesce(sum(o.price * o.quantity), 0)::bigint AS n FROM orders o
      WHERE o.tenant_id = $1 AND o.correlation_id = $2 AND o.owner_id = $3`,
    [p.tenantId, a.correlation_id, a.agent_id],
  );
  // Evaluated as of the original request time: the human approves that request, not a new one.
  const decision = evaluateOrderPolicy(policy, req, {
    now: a.created_at,
    startedAt: a.started_at,
    committed: committed.rows[0]?.n ?? 0,
    approved: true,
  });
  if (decision.decision !== 'approved') {
    await mark('rejected');
    return { approvalId, status: 'rejected', result: null, reasons: decision.reasons };
  }
  const result = await s.exchange.execute(
    {
      meta: {
        idempotencyKey: `approval-${approvalId}`,
        correlationId: a.correlation_id,
        causationId: approvalId,
        actor: { tenantId: p.tenantId, actorId: a.agent_id, kind: 'agent' },
        issuedAt: new Date().toISOString(),
      },
      payload: {
        type: 'PlaceOrder',
        marketId: req.marketId,
        outcome: req.outcome,
        price: req.price,
        quantity: req.quantity,
      },
    },
    {
      decision: 'approved',
      reasons: [
        ...decision.reasons,
        { code: 'HUMAN_APPROVED', message: `approved by ${p.actorId}` },
      ],
    },
  );
  await mark('approved');
  return { approvalId, status: 'approved', result };
}
