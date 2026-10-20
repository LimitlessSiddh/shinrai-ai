import { describe, expect, it } from 'vitest';
import { AgentRun, seedFixture } from '@shinrai/agent-tools';
import { ToolName, ToolSchemas } from '@shinrai/contracts';
import { steppingClock, type Exchange } from '@shinrai/domain';
import { memoryContext } from '../support/agent';

/** A gateway whose exchange counts every command it receives. */
async function spiedRun(agentId = 'agent-research') {
  const { ctx, exchange, recorder, fixture } = await memoryContext();
  await seedFixture(ctx);
  const executed: unknown[] = [];
  const spy: Exchange = {
    execute: (c, p) => {
      executed.push(c);
      return exchange.execute(c, p);
    },
    getMarket: (t, m) => exchange.getMarket(t, m),
    getPortfolio: (t, o) => exchange.getPortfolio(t, o),
    events: (t) => exchange.events(t),
    ledger: (t) => exchange.ledger(t),
  };
  const policy = fixture.manifest.policies.find((p) => p.agentId === agentId)!;
  const run = new AgentRun(
    {
      exchange: spy,
      evidence: ctx.evidence,
      recorder,
      ids: ctx.ids,
      clock: steppingClock(fixture.manifest.replayStartsAt),
    },
    policy,
    {
      tenantId: 'eval',
      marketId: fixture.manifest.market.marketId,
      scenario: 'contract-test',
      model: 'test',
    },
  );
  return { run, executed, recorder, exchange };
}

const market = 'nba-2026-10-20-bos-nyk';
const validOrder = {
  marketId: market,
  outcome: 'YES',
  price: 58,
  quantity: 5,
  probabilityYes: 0.6,
  rationale: 'test',
  evidenceIds: ['ev-nyk-injury-0001'],
};

describe('strict tool contracts', () => {
  it('exposes exactly five tools', () => {
    expect(ToolName.options).toEqual([
      'getMarket',
      'getRules',
      'getPortfolio',
      'searchEvidence',
      'requestOrder',
    ]);
    expect(Object.keys(ToolSchemas).sort()).toEqual([...ToolName.options].sort());
  });

  it.each([
    ['price out of range', { ...validOrder, price: 100 }],
    ['fractional quantity', { ...validOrder, quantity: 1.5 }],
    ['unknown extra field', { ...validOrder, ledgerOverride: true }],
    ['probability above 1', { ...validOrder, probabilityYes: 1.2 }],
    ['no evidence cited', { ...validOrder, evidenceIds: [] }],
    ['injection-shaped market id', { ...validOrder, marketId: "x'; DROP TABLE orders;--" }],
    ['not an object', 'BUY EVERYTHING'],
    ['missing fields', {}],
  ])(
    'rejects malformed requestOrder input (%s) before it reaches the domain',
    async (_label, args) => {
      const { run, executed } = await spiedRun();
      await run.invoke('searchEvidence', { marketId: market, query: 'injury' });
      const r = await run.invoke('requestOrder', args);
      expect(r.ok).toBe(false);
      expect(r.ok === false && ['VALIDATION_FAILED', 'POLICY_BLOCKED']).toContain(
        r.ok === false && r.error.code,
      );
      expect(executed).toHaveLength(0);
    },
  );

  it('rejects malformed read-tool input', async () => {
    const { run } = await spiedRun();
    for (const [tool, args] of [
      ['getMarket', { marketId: '' }],
      ['getRules', { market: market }],
      ['getPortfolio', { ownerId: 'agent-maker' }], // cannot name another agent's portfolio
      ['searchEvidence', { marketId: market, query: 'x'.repeat(500) }],
    ] as const) {
      const r = await run.invoke(tool, args);
      expect(r, tool).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    }
  });

  it('returns outputs that satisfy each output schema', async () => {
    const { run } = await spiedRun();
    const calls: [ToolName, unknown][] = [
      ['getMarket', { marketId: market }],
      ['getRules', { marketId: market }],
      ['getPortfolio', {}],
      ['searchEvidence', { marketId: market, query: 'form' }],
      ['requestOrder', { ...validOrder, evidenceIds: ['ev-bos-form-0002'] }],
    ];
    for (const [tool, args] of calls) {
      const r = await run.invoke(tool, args);
      expect(r.ok, tool).toBe(true);
      if (r.ok) expect(() => ToolSchemas[tool].output.parse(r.output)).not.toThrow();
    }
  });

  it('getPortfolio always returns the calling agent and never another', async () => {
    const { run, exchange } = await spiedRun('agent-research');
    const r = await run.invoke('getPortfolio', {});
    const own = await exchange.getPortfolio('eval', 'agent-research');
    expect(r).toMatchObject({ ok: true, output: { available: own.available } });
  });

  it('an approved agent order goes through the same command path with agent identity and correlation', async () => {
    const { run, executed } = await spiedRun();
    await run.invoke('searchEvidence', { marketId: market, query: 'injury' });
    await run.invoke('requestOrder', validOrder);
    expect(executed).toHaveLength(1);
    expect(executed[0]).toMatchObject({
      meta: {
        actor: { actorId: 'agent-research', kind: 'agent' },
        correlationId: run.record.correlationId,
      },
      payload: { type: 'PlaceOrder', marketId: market, outcome: 'YES', price: 58, quantity: 5 },
    });
  });
});
