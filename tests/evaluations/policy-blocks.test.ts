import { describe, expect, it } from 'vitest';
import { runScenario, seedFixture } from '@shinrai/agent-tools';
import { memoryContext, scenario } from '../support/agent';

/** Runs one scenario after seeding and returns what the agent did and what changed. */
async function runOne(id: string) {
  const { ctx, exchange, recorder, fixture } = await memoryContext();
  await seedFixture(ctx);
  const s = scenario(fixture, id);
  const before = await exchange.getPortfolio('eval', s.agentId);
  const ledgerBefore = (await exchange.ledger('eval')).length;
  const { run, outcome } = await runScenario(ctx, s);
  return {
    calls: recorder.calls.filter((c) => c.runId === run.runId),
    before,
    after: await exchange.getPortfolio('eval', s.agentId),
    ledgerDelta: (await exchange.ledger('eval')).length - ledgerBefore,
    outcome,
    recorder,
    exchange,
  };
}

const codes = (c: { reasons: { code: string }[] }) => c.reasons.map((r) => r.code).sort();

describe('policy blocks unsafe agent actions with zero state mutation', () => {
  it('approves and executes the in-policy research order through the command path', async () => {
    const r = await runOne('research-happy');
    const order = r.calls.find((c) => c.tool === 'requestOrder');
    expect(order).toMatchObject({ ok: true, policyDecision: 'approved' });
    expect(order?.output).toMatchObject({ status: 'accepted', filledQuantity: 50 });
    expect(r.after.positions).toEqual([
      {
        ownerId: 'agent-research',
        marketId: 'nba-2026-10-20-bos-nyk',
        outcome: 'YES',
        quantity: 50,
        cost: 2_900,
      },
    ]);
    expect(r.calls.every((c) => c.ok)).toBe(true);
  });

  it('blocks an oversized, over-budget order', async () => {
    const r = await runOne('reckless-oversize');
    const order = r.calls.find((c) => c.tool === 'requestOrder');
    expect(order).toMatchObject({ ok: false, policyDecision: 'blocked' });
    expect(codes(order!)).toEqual(['BUDGET_EXCEEDED', 'ORDER_SIZE_EXCEEDED']);
    expect(r.after).toEqual(r.before);
    expect(r.ledgerDelta).toBe(0);
  });

  it('blocks reads and orders on a market outside scope', async () => {
    const r = await runOne('reckless-out-of-scope');
    expect(r.calls.map((c) => [c.tool, c.policyDecision, codes(c)])).toEqual([
      ['getMarket', 'blocked', ['MARKET_OUT_OF_SCOPE']],
      ['requestOrder', 'blocked', ['MARKET_OUT_OF_SCOPE']],
    ]);
    expect(r.ledgerDelta).toBe(0);
  });

  it('blocks every privileged or unlisted tool', async () => {
    const r = await runOne('reckless-forbidden-tools');
    expect(r.calls.map((c) => [c.tool, c.ok, c.policyDecision, codes(c)])).toEqual([
      ['runSql', false, 'blocked', ['TOOL_NOT_ALLOWED']],
      ['shell', false, 'blocked', ['TOOL_NOT_ALLOWED']],
      ['httpGet', false, 'blocked', ['TOOL_NOT_ALLOWED']],
      ['resolveMarket', false, 'blocked', ['TOOL_NOT_ALLOWED']],
      ['getPortfolio', false, 'blocked', ['TOOL_NOT_ALLOWED']], // valid tool, but not on this agent's allowlist
    ]);
    expect(r.ledgerDelta).toBe(0);
  });

  it('blocks a request made after the run deadline', async () => {
    const r = await runOne('reckless-expired');
    expect(
      r.calls.every(
        (c) => c.policyDecision === 'blocked' && codes(c).includes('RUN_DEADLINE_EXCEEDED'),
      ),
    ).toBe(true);
    expect(r.after).toEqual(r.before);
  });

  it('blocks an order citing evidence the agent never retrieved', async () => {
    const r = await runOne('reckless-malformed');
    const uncited = r.calls[1];
    expect(uncited).toMatchObject({ tool: 'requestOrder', ok: false, policyDecision: 'blocked' });
    expect(codes(uncited!)).toEqual(['EVIDENCE_NOT_RETRIEVED']);
    expect(r.ledgerDelta).toBe(0);
  });

  it('holds an above-threshold order for human approval without placing it', async () => {
    const r = await runOne('research-needs-approval');
    const order = r.calls.find((c) => c.tool === 'requestOrder');
    expect(order).toMatchObject({ ok: true, policyDecision: 'approval_required' });
    expect(order?.output).toMatchObject({ status: 'approval_required', orderId: null });
    expect(r.recorder.approvals).toHaveLength(1);
    expect(r.ledgerDelta).toBe(0);
  });

  it('records every tool call under the run correlation id with an agent.tool.called event', async () => {
    const r = await runOne('reckless-forbidden-tools');
    const run = r.recorder.runs[0]!;
    const toolEvents = r.recorder.events.filter((e) => e.type === 'agent.tool.called');
    expect(toolEvents).toHaveLength(r.calls.length);
    expect(new Set(toolEvents.map((e) => e.correlationId))).toEqual(new Set([run.correlationId]));
    expect(toolEvents.map((e) => e.causationId)).toEqual(r.calls.map((c) => c.toolCallId));
  });
});
