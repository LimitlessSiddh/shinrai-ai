import { describe, expect, it } from 'vitest';
import type { AgentPolicy } from '@shinrai/contracts';
import {
  brierScore,
  checkToolAccess,
  evaluate,
  evaluateOrderPolicy,
  logLoss,
  maxDrawdown,
} from '@shinrai/domain';

const policy: AgentPolicy = {
  agentId: 'agent-research',
  allowedTools: ['getMarket', 'getRules', 'getPortfolio', 'searchEvidence', 'requestOrder'],
  marketScope: ['m1'],
  budget: 10_000,
  maxOrderQuantity: 100,
  approvalThreshold: 5_000,
  runDeadlineSeconds: 60,
};
const clock = { startedAt: '2026-10-20T20:00:00.000Z', now: '2026-10-20T20:00:30.000Z' };

describe('agent policy', () => {
  it('approves an in-policy order', () => {
    expect(
      evaluateOrderPolicy(
        policy,
        { marketId: 'm1', price: 58, quantity: 50 },
        { ...clock, committed: 0, approved: false },
      ).decision,
    ).toBe('approved');
  });

  it('collects every violation for a blocked order', () => {
    const d = evaluateOrderPolicy(
      policy,
      { marketId: 'm2', price: 90, quantity: 200 },
      { ...clock, now: '2026-10-20T20:05:00.000Z', committed: 0, approved: false },
    );
    expect(d.decision).toBe('blocked');
    expect(d.reasons.map((r) => r.code).sort()).toEqual([
      'BUDGET_EXCEEDED',
      'MARKET_OUT_OF_SCOPE',
      'ORDER_SIZE_EXCEEDED',
      'RUN_DEADLINE_EXCEEDED',
    ]);
  });

  it('counts already committed spend against the budget', () => {
    const d = evaluateOrderPolicy(
      policy,
      { marketId: 'm1', price: 50, quantity: 50 },
      { ...clock, committed: 8_000, approved: false },
    );
    expect(d.reasons.map((r) => r.code)).toEqual(['BUDGET_EXCEEDED']);
  });

  it('requires approval above the threshold unless approved', () => {
    const req = { marketId: 'm1', price: 80, quantity: 70 };
    expect(
      evaluateOrderPolicy(policy, req, { ...clock, committed: 0, approved: false }).decision,
    ).toBe('approval_required');
    expect(
      evaluateOrderPolicy(policy, req, { ...clock, committed: 0, approved: true }).decision,
    ).toBe('approved');
  });

  it('gates tools by allowlist', () => {
    expect(
      checkToolAccess({ ...policy, allowedTools: ['getMarket'] }, 'requestOrder', clock).map(
        (r) => r.code,
      ),
    ).toEqual(['TOOL_NOT_ALLOWED']);
    expect(checkToolAccess(policy, 'runSql', clock).map((r) => r.code)).toEqual([
      'TOOL_NOT_ALLOWED',
    ]);
  });
});

describe('evaluation metrics', () => {
  it('computes Brier score and log loss', () => {
    const f = [{ marketId: 'm1', probabilityYes: 0.64, outcome: 'YES' as const }];
    expect(brierScore(f)).toBe(0.1296);
    expect(logLoss(f)).toBeCloseTo(0.446287, 6);
    expect(brierScore([])).toBeNull();
  });

  it('clamps log loss for certain-but-wrong forecasts', () => {
    expect(logLoss([{ marketId: 'm', probabilityYes: 1, outcome: 'NO' }])).toBeCloseTo(
      13.815511,
      5,
    );
  });

  it('measures max drawdown from the peak', () => {
    expect(maxDrawdown([100, 120, 90, 130, 117])).toBe(0.25);
    expect(maxDrawdown([100, 101, 102])).toBe(0);
  });

  it('reports PnL, adherence and tool success', () => {
    const r = evaluate({
      forecasts: [],
      equityCurve: [10_000, 9_000, 12_000],
      orderRequests: { total: 4, blocked: 1 },
      toolCalls: { total: 10, ok: 9 },
    });
    expect(r).toMatchObject({
      paperPnl: 2_000,
      policyAdherence: 0.75,
      policyViolations: 1,
      toolCallSuccessRate: 0.9,
      maxDrawdown: 0.1,
    });
  });
});
