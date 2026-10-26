import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, loadConfig } from '@shinrai/api';
import { createPool, type Pool } from '@shinrai/adapters';
import { counts, freshDatabase } from '../support/pg';

process.env.LOG_LEVEL = 'silent';
const OPERATOR = 'dev-operator-test-token-0001';
const AGENT = 'dev-agent-test-token-000001';
const MARKET = 'nba-2026-10-20-bos-nyk';
const FIXTURE = 'nba-2026-10-20.1';

let app: Awaited<ReturnType<typeof buildApp>>;
let pool: Pool;

const call = (
  method: 'GET' | 'POST',
  url: string,
  body?: unknown,
  token = OPERATOR,
  headers: Record<string, string> = {},
) =>
  app.inject({
    method,
    url,
    ...(body === undefined ? {} : { payload: body as object }),
    headers: { authorization: `Bearer ${token}`, ...headers },
  });

beforeAll(async () => {
  const { url } = await freshDatabase();
  pool = createPool(url);
  const config = loadConfig({
    DATABASE_URL: url,
    // The maker token tries to grant itself trade scope; the API clamps agents to read-only.
    SHINRAI_DEV_TOKENS: `${OPERATOR}=demo:operator:human:read|trade|resolve|replay|approve;${AGENT}=demo:agent-research:agent:read|trade|resolve`,
  });
  app = await buildApp(config, pool);
});
afterAll(() => app?.close());

describe('HTTP API', () => {
  it('requires authentication and always returns a correlation id', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/markets',
      headers: { 'x-correlation-id': 'corr-client-123' },
    });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
      correlationId: 'corr-client-123',
    });
    expect(r.headers['x-correlation-id']).toBe('corr-client-123');
  });

  it('seeds the fixture idempotently and lists the market', async () => {
    expect((await call('POST', `/fixtures/${FIXTURE}/seed`)).statusCode).toBe(201);
    expect((await call('POST', `/fixtures/${FIXTURE}/seed`)).statusCode).toBe(201);
    const r = await call('GET', '/markets');
    expect(r.json().data.map((m: { market_id: string }) => m.market_id)).toEqual([MARKET]);
    const rules = await call('GET', `/markets/${MARKET}/rules`);
    expect(rules.json().data).toHaveLength(5);
  });

  it('never lets an agent token trade, resolve or read another portfolio', async () => {
    const order = {
      marketId: MARKET,
      outcome: 'YES',
      price: 50,
      quantity: 1,
      idempotencyKey: 'agent-http-01',
    };
    expect((await call('POST', '/orders', order, AGENT)).statusCode).toBe(403);
    expect(
      (
        await call(
          'POST',
          `/markets/${MARKET}/resolve`,
          { winningOutcome: 'YES', source: 'x', idempotencyKey: 'agent-res-01' },
          AGENT,
        )
      ).statusCode,
    ).toBe(403);
    expect((await call('GET', '/portfolio/agent-maker', undefined, AGENT)).statusCode).toBe(403);
    expect((await call('GET', '/portfolio/agent-research', undefined, AGENT)).statusCode).toBe(200);
  });

  it('returns typed 422s for invalid input, never 500', async () => {
    for (const body of [
      {},
      { marketId: MARKET, outcome: 'MAYBE', price: 50, quantity: 1, idempotencyKey: 'bad-0001' },
      { marketId: MARKET, outcome: 'YES', price: 0, quantity: 1, idempotencyKey: 'bad-0002' },
    ]) {
      const r = await call('POST', '/orders', body);
      expect(r.statusCode).toBe(422);
      expect(r.json().error.code).toBe('VALIDATION_FAILED');
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/orders',
          payload: 'not json',
          headers: { authorization: `Bearer ${OPERATOR}`, 'content-type': 'application/json' },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('rejects an insufficient-credit order with zero state mutation', async () => {
    const before = await counts(pool);
    const r = await call('POST', '/orders', {
      marketId: MARKET,
      outcome: 'YES',
      price: 99,
      quantity: 50_000,
      idempotencyKey: 'too-big-001',
    });
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({
      error: { code: 'INSUFFICIENT_CREDITS' },
      correlationId: expect.any(String),
    });
    const after = await counts(pool);
    for (const t of [
      'orders',
      'fills',
      'credit_reservations',
      'ledger_entries',
      'positions',
    ] as const)
      expect(after[t]).toBe(before[t]);
  });

  it('accepts a human order, then replays it for the same idempotency key', async () => {
    const body = {
      marketId: MARKET,
      outcome: 'YES',
      price: 60,
      quantity: 5,
      idempotencyKey: 'human-order-01',
    };
    const first = await call('POST', '/orders', body);
    const again = await call('POST', '/orders', body);
    expect(first.statusCode).toBe(201);
    expect(again.statusCode).toBe(200);
    expect(again.json().data).toEqual({ ...first.json().data, replayed: true });
    expect(first.json().data.event.payload.fills).toHaveLength(1); // crosses maker NO @ 42
  });

  it('runs the agent happy path and a blocked run through the gateway, visible in the trace', async () => {
    const ok = await call('POST', '/agent-runs', {
      fixtureVersion: FIXTURE,
      scenarioId: 'research-happy',
    });
    expect(ok.statusCode).toBe(201);
    const run = ok.json().data;
    expect(run).toMatchObject({
      status: 'completed',
      agentId: 'agent-research',
      correlationId: ok.json().correlationId,
    });

    const trace = (await call('GET', `/trace/${run.correlationId}`)).json().data;
    expect(trace.runs).toHaveLength(1);
    expect(trace.toolCalls.map((c: { tool: string }) => c.tool)).toEqual([
      'getMarket',
      'getRules',
      'getPortfolio',
      'searchEvidence',
      'searchEvidence',
      'requestOrder',
    ]);
    expect(trace.audit).toEqual([
      expect.objectContaining({
        command_type: 'PlaceOrder',
        outcome: 'accepted',
        policy: expect.objectContaining({ decision: 'approved' }),
      }),
    ]);
    expect(trace.ledger.map((t: { reason: string }) => t.reason)).toEqual(['reserve', 'fill']);
    expect(trace.events.map((e: { type: string }) => e.type)).toContain('order.placed');

    const blocked = await call('POST', '/agent-runs', {
      fixtureVersion: FIXTURE,
      scenarioId: 'reckless-oversize',
    });
    const bt = (await call('GET', `/trace/${blocked.json().data.correlationId}`)).json().data;
    expect(bt.toolCalls.find((c: { tool: string }) => c.tool === 'requestOrder')).toMatchObject({
      policy_decision: 'blocked',
      ok: false,
    });
    expect(bt.audit).toEqual([]);
    expect(bt.ledger).toEqual([]);
  });

  it('holds a large agent order for approval and executes it after a human approves', async () => {
    const r = await call('POST', '/agent-runs', {
      fixtureVersion: FIXTURE,
      scenarioId: 'research-needs-approval',
    });
    const detail = (await call('GET', `/runs/${r.json().data.runId}`)).json().data;
    const approval = detail.approvals[0];
    expect(approval.status).toBe('pending');
    const decided = await call('POST', `/approvals/${approval.approval_id}/approve`);
    expect(decided.json().data).toMatchObject({
      status: 'approved',
      result: { status: 'accepted' },
    });
    expect((await call('POST', `/approvals/${approval.approval_id}/approve`)).statusCode).toBe(409);
    const audit = await pool.query(`SELECT policy FROM audit_log WHERE correlation_id = $1`, [
      r.json().data.correlationId,
    ]);
    expect(audit.rows[0].policy.reasons.map((x: { code: string }) => x.code)).toContain(
      'HUMAN_APPROVED',
    );
  });

  it('resolves once and reports the original result on retry', async () => {
    const first = await call('POST', `/markets/${MARKET}/resolve`, {
      winningOutcome: 'YES',
      source: 'fixture:final-score',
      idempotencyKey: 'resolve-api-01',
    });
    const retry = await call('POST', `/markets/${MARKET}/resolve`, {
      winningOutcome: 'YES',
      source: 'fixture:final-score',
      idempotencyKey: 'resolve-api-02',
    });
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data.event.eventId).toBe(first.json().data.event.eventId);
    const conflict = await call('POST', `/markets/${MARKET}/resolve`, {
      winningOutcome: 'NO',
      source: 'x',
      idempotencyKey: 'resolve-api-03',
    });
    expect(conflict.statusCode).toBe(409);
  });

  it('serves order book depth, fills, runs, the journal and pipeline health', async () => {
    const m = (await call('GET', `/markets/${MARKET}`)).json().data;
    expect(m.book).toEqual([]); // resolution cancelled every resting order
    expect(m.fills[0]).toMatchObject({
      yes_price: expect.any(Number),
      quantity: expect.any(Number),
    });

    const runs = (await call('GET', '/runs?limit=5')).json().data;
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0]).toHaveProperty('blocked_calls');

    const ledger = (await call('GET', '/ledger?limit=10')).json().data;
    for (const tx of ledger.transactions) {
      const net = tx.entries.reduce(
        (s: number, e: { direction: string; amount: number }) =>
          s + (e.direction === 'credit' ? e.amount : -e.amount),
        0,
      );
      expect(net).toBe(0);
    }
    expect(ledger.accounts.some((a: { kind: string }) => a.kind === 'issuance')).toBe(true);

    const sys = (await call('GET', '/system')).json().data;
    expect(sys).toMatchObject({
      events: expect.any(Number),
      unpublished: expect.any(Number),
      deadLetters: [],
      model: 'fake-deterministic',
    });
  });

  it('runs a replay and serves the stored evaluation', async () => {
    const r = await call('POST', '/replays', { fixtureVersion: FIXTURE });
    expect(r.statusCode).toBe(201);
    const list = (await call('GET', '/evaluations')).json().data;
    expect(list[0]).toMatchObject({
      report_hash: r.json().data.hash,
      correlation_id: r.json().correlationId,
    });
    expect(list[0].report.agents['agent-research'].brierScore).toBe(0.1296);
  });
});
