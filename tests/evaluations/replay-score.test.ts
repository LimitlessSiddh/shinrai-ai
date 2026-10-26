import { describe, expect, it } from 'vitest';
import { replayFixture } from '@shinrai/agent-tools';
import { memoryContext } from '../support/agent';

describe('deterministic replay and evaluation', () => {
  it('produces an identical report and hash on every run', async () => {
    const a = await replayFixture((await memoryContext()).ctx);
    const b = await replayFixture((await memoryContext()).ctx);
    expect(b.report).toEqual(a.report);
    expect(b.hash).toBe(a.hash);
  });

  it('scores the research agent: calibrated, profitable, fully policy-adherent', async () => {
    const { report } = await replayFixture((await memoryContext()).ctx);
    expect(report.agents['agent-research']).toMatchObject({
      forecasts: 2,
      brierScore: 0.1296, // (1 - 0.64)^2
      logLoss: 0.446287, // -ln(0.64)
      startingCredits: 100_000,
      paperPnl: 50 * (100 - 58), // 50 YES at 58, BOS won
      policyAdherence: 1,
      policyViolations: 0,
      toolCallSuccessRate: 1,
      maxDrawdown: 0,
    });
    expect(report.approvalsPending).toBe(1);
  });

  it('scores the reckless agent: every unsafe action counted, no credits moved', async () => {
    const { report } = await replayFixture((await memoryContext()).ctx);
    const r = report.agents['agent-reckless']!;
    expect(r.paperPnl).toBe(0);
    expect(r.policyViolations).toBeGreaterThanOrEqual(10);
    expect(r.policyAdherence).toBeLessThan(0.5);
    expect(r.toolCallSuccessRate).toBeLessThan(0.5);
  });

  it('matches the golden report for fixture nba-2026-10-20.1', async () => {
    const { report, hash } = await replayFixture((await memoryContext()).ctx);
    expect({ hash, report }).toMatchSnapshot();
  });
});
