import type { Command, CommandPayload, Evidence, Fixture, Scenario } from '@shinrai/contracts';
import {
  equityCurve,
  evaluate,
  fingerprint,
  steppingClock,
  type Clock,
  type EvaluationReport,
  type Exchange,
  type IdSource,
} from '@shinrai/domain';
import { AgentRun } from './gateway';
import { FakeModelRunner, type ModelRunner } from './model';
import type { ApprovalRecord, EvidenceSource, RunRecorder, ToolCallRecord } from './ports';

export type FixtureContext = {
  fixture: Fixture;
  tenantId: string;
  exchange: Exchange;
  recorder: RunRecorder;
  evidence: EvidenceSource;
  ids: IdSource;
  clock: Clock;
  /** Prefix for deterministic idempotency keys, e.g. `seed` or `replay`. */
  keyPrefix: string;
  /** Clock for an agent run. Defaults to a deterministic stepping clock (replay); live runs pass the real clock. */
  runClock?: (scenario: Scenario) => Clock;
};

export const fixtureEvidence = (fixture: Fixture): EvidenceSource => ({
  forMarket: async (_tenant, marketId) =>
    fixture.manifest.evidence.filter((e: Evidence) => e.marketId === marketId),
});

function command(
  ctx: FixtureContext,
  n: string,
  actorId: string,
  kind: 'human' | 'agent',
  payload: CommandPayload,
): Command {
  const key = `${ctx.keyPrefix}-${ctx.fixture.manifest.fixtureVersion}-${n}`;
  return {
    meta: {
      idempotencyKey: key,
      correlationId: `corr-${key}`,
      causationId: `fixture-${ctx.fixture.manifest.fixtureVersion}`,
      actor: { tenantId: ctx.tenantId, actorId, kind },
      issuedAt: ctx.clock.now(),
    },
    payload,
  };
}

/** Opens the fixture market, grants paper credits and places the scripted liquidity. Idempotent by key. */
export async function seedFixture(ctx: FixtureContext): Promise<void> {
  const m = ctx.fixture.manifest;
  const must = async (c: Command) => {
    const r = await ctx.exchange.execute(c);
    if (r.status === 'rejected' && r.code !== 'MARKET_ALREADY_EXISTS')
      throw new Error(`fixture seed failed: ${r.code} ${r.message}`);
  };
  await must(command(ctx, 'open', 'operator', 'human', { type: 'OpenMarket', market: m.market }));
  for (const [i, g] of m.grants.entries()) {
    await must(
      command(ctx, `grant-${i}`, 'operator', 'human', {
        type: 'GrantCredits',
        ownerId: g.ownerId,
        amount: g.amount,
      }),
    );
  }
  for (const [i, l] of m.liquidity.entries()) {
    await must(
      command(ctx, `liquidity-${i}`, l.ownerId, 'agent', {
        type: 'PlaceOrder',
        marketId: m.market.marketId,
        outcome: l.outcome,
        price: l.price,
        quantity: l.quantity,
      }),
    );
  }
}

/** Runs one scenario through the restricted gateway with the given model (fake by default). */
export async function runScenario(
  ctx: FixtureContext,
  scenario: Scenario,
  model?: ModelRunner,
  correlationId?: string,
) {
  const policy = ctx.fixture.manifest.policies.find((p) => p.agentId === scenario.agentId);
  if (!policy) throw new Error(`no policy for ${scenario.agentId}`);
  const runner = model ?? new FakeModelRunner(scenario.steps);
  const run = new AgentRun(
    {
      exchange: ctx.exchange,
      evidence: ctx.evidence,
      recorder: ctx.recorder,
      ids: ctx.ids,
      clock: steppingClock(ctx.clock.now(), scenario.clockStepSeconds * 1000),
    },
    policy,
    {
      tenantId: ctx.tenantId,
      marketId: ctx.fixture.manifest.market.marketId,
      scenario: scenario.scenarioId,
      model: runner.name,
      ...(correlationId ? { correlationId } : {}),
    },
  );
  await run.start();
  const outcome = await runner.drive(
    run,
    `Research market ${ctx.fixture.manifest.market.marketId} and decide whether to request one paper order.`,
  );
  await run.finish(outcome.status, outcome.conclusion);
  return { run: run.record, outcome };
}

export async function resolveFixture(ctx: FixtureContext) {
  const m = ctx.fixture.manifest;
  return ctx.exchange.execute(
    command(ctx, 'resolve', 'operator', 'human', {
      type: 'ResolveMarket',
      marketId: m.market.marketId,
      winningOutcome: m.resolution.winningOutcome,
      source: `${m.resolution.source} (${m.resolution.finalScore})`,
    }),
  );
}

/** Captures records while forwarding them, so the report is built from exactly what was persisted. */
function capturing(inner: RunRecorder) {
  const calls: ToolCallRecord[] = [];
  const approvals: ApprovalRecord[] = [];
  const recorder: RunRecorder = {
    startRun: (r) => inner.startRun(r),
    recordToolCall: async (c, e) => {
      calls.push(c);
      await inner.recordToolCall(c, e);
    },
    requestApproval: async (a) => {
      approvals.push(a);
      await inner.requestApproval(a);
    },
    finishRun: (...args) => inner.finishRun(...args),
  };
  return { recorder, calls, approvals };
}

export type ReplayReport = {
  fixtureVersion: string;
  marketId: string;
  question: string;
  resolution: { winningOutcome: string; finalScore: string };
  market: { matchedContracts: number; openingYesPrice: number | null; lastYesPrice: number | null };
  runs: {
    scenarioId: string;
    agentId: string;
    status: string;
    probabilityYes: number | null;
    thesis: string | null;
    toolCalls: { seq: number; tool: string; ok: boolean; policy: string; reasons: string[] }[];
  }[];
  approvalsPending: number;
  agents: Record<string, EvaluationReport>;
  ledger: { transactions: number; fingerprint: string };
};

/**
 * Full deterministic replay: seed -> every scenario -> resolve -> evaluate. Given the same fixture,
 * id source and clock, the report is byte-identical on any adapter (in-memory or PostgreSQL).
 */
export async function replayFixture(
  base: FixtureContext,
): Promise<{ report: ReplayReport; hash: string }> {
  const cap = capturing(base.recorder);
  const ctx = { ...base, recorder: cap.recorder };
  const m = ctx.fixture.manifest;
  await seedFixture(ctx);
  const runs = [];
  for (const s of ctx.fixture.scenarios) runs.push({ scenario: s, ...(await runScenario(ctx, s)) });
  const resolved = await resolveFixture(ctx);
  if (resolved.status !== 'accepted')
    throw new Error(`fixture resolution failed: ${JSON.stringify(resolved)}`);

  const ledger = await ctx.exchange.ledger(ctx.tenantId);
  const view = await ctx.exchange.getMarket(ctx.tenantId, m.market.marketId);
  const agents: Record<string, EvaluationReport> = {};
  for (const agentId of [...new Set(ctx.fixture.scenarios.map((s) => s.agentId))].sort()) {
    const mine = runs.filter((r) => r.scenario.agentId === agentId);
    const calls = cap.calls.filter((c) => mine.some((r) => r.run.runId === c.runId));
    const violations = calls.filter(
      (c) =>
        c.policyDecision === 'blocked' || c.reasons.some((r) => r.code === 'VALIDATION_FAILED'),
    );
    agents[agentId] = evaluate({
      forecasts: mine
        .filter((r) => r.outcome.conclusion)
        .map((r) => ({
          marketId: m.market.marketId,
          probabilityYes: r.outcome.conclusion?.probabilityYes ?? 0,
          outcome: m.resolution.winningOutcome,
        })),
      equityCurve: equityCurve(ledger, agentId),
      orderRequests: { total: calls.length, blocked: violations.length },
      toolCalls: { total: calls.length, ok: calls.filter((c) => c.ok).length },
    });
  }

  const report: ReplayReport = {
    fixtureVersion: m.fixtureVersion,
    marketId: m.market.marketId,
    question: m.market.question,
    resolution: {
      winningOutcome: m.resolution.winningOutcome,
      finalScore: m.resolution.finalScore,
    },
    market: {
      matchedContracts: view?.matchedContracts ?? 0,
      openingYesPrice: view?.openingYesPrice ?? null,
      lastYesPrice: view?.lastYesPrice ?? null,
    },
    runs: runs.map((r) => ({
      scenarioId: r.scenario.scenarioId,
      agentId: r.scenario.agentId,
      status: r.outcome.status,
      probabilityYes: r.outcome.conclusion?.probabilityYes ?? null,
      thesis: r.outcome.conclusion?.thesis ?? null,
      toolCalls: cap.calls
        .filter((c) => c.runId === r.run.runId)
        .map((c) => ({
          seq: c.seq,
          tool: c.tool,
          ok: c.ok,
          policy: c.policyDecision,
          reasons: c.reasons.map((x) => x.code),
        })),
    })),
    approvalsPending: cap.approvals.length,
    agents,
    // Ids are excluded so the fingerprint compares economics, not identifier formats.
    ledger: {
      transactions: ledger.length,
      fingerprint: fingerprint(ledger.map(({ reason, entries }) => ({ reason, entries }))),
    },
  };
  return { report, hash: fingerprint(report) };
}
