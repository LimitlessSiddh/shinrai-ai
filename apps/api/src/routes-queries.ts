import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listFixtures, loadFixture, readMarketView } from '@shinrai/adapters';
import { Id } from '@shinrai/contracts';
import type { Services } from './agents';
import { ApiError, ok, parse, requireScope } from './http';
import { traceByCorrelation } from './trace';

const IdParam = z.strictObject({ id: Id });
const Limit = z.coerce.number().int().min(1).max(200).default(50);

export function queryRoutes(app: FastifyInstance, s: Services) {
  const db = s.pool;

  app.get('/health', async (req, reply) => {
    await db.query('SELECT 1');
    return ok(req, reply, {
      status: 'ok',
      profile: s.config.profile,
      model: s.config.model.openaiEnabled ? 'openai (opt-in)' : 'fake',
    });
  });

  app.get('/markets', async (req, reply) => {
    const p = requireScope(req, 'read');
    const r = await db.query(
      `SELECT m.market_id, m.definition, m.status, m.winning_outcome, s.view AS snapshot, s.applied_events, s.updated_at AS projected_at
         FROM markets m LEFT JOIN market_snapshots s USING (tenant_id, market_id)
        WHERE m.tenant_id = $1 ORDER BY m.opened_at DESC`,
      [p.tenantId],
    );
    return ok(req, reply, r.rows);
  });

  /** Market command center: projection (may lag) + authoritative status + agent runs touching it. */
  app.get('/markets/:id', async (req, reply) => {
    const p = requireScope(req, 'read');
    const { id } = parse(IdParam, req.params);
    const snap = await db.query(
      'SELECT view, applied_events, last_event_id, updated_at FROM market_snapshots WHERE tenant_id = $1 AND market_id = $2',
      [p.tenantId, id],
    );
    const source = await readMarketView(db, p.tenantId, id);
    if (!source) throw new ApiError(404, 'MARKET_NOT_FOUND', id);
    const runs = await db.query(
      `SELECT r.run_id, r.agent_id, r.scenario, r.model, r.status, r.correlation_id, r.started_at, r.conclusion,
              o.input AS order_request, o.output AS order_result, o.policy_decision, o.reasons, o.ok AS order_ok,
              (SELECT count(*)::int FROM agent_tool_calls c WHERE c.tenant_id = r.tenant_id AND c.run_id = r.run_id) AS tool_calls,
              (SELECT approval_id FROM approval_requests a WHERE a.tenant_id = r.tenant_id AND a.run_id = r.run_id AND a.status = 'pending' LIMIT 1) AS pending_approval
         FROM agent_runs r
         LEFT JOIN LATERAL (SELECT * FROM agent_tool_calls c WHERE c.tenant_id = r.tenant_id AND c.run_id = r.run_id AND c.tool = 'requestOrder'
                            ORDER BY c.seq DESC LIMIT 1) o ON true
        WHERE r.tenant_id = $1 AND r.market_id = $2 ORDER BY r.started_at DESC, r.run_id DESC LIMIT 20`,
      [p.tenantId, id],
    );
    const evidence = await db.query(
      'SELECT item FROM evidence_items WHERE tenant_id = $1 AND market_id = $2 ORDER BY evidence_id',
      [p.tenantId, id],
    );
    return ok(req, reply, {
      market: source.market,
      projection: snap.rows[0]
        ? {
            view: snap.rows[0].view,
            appliedEvents: snap.rows[0].applied_events,
            lastEventId: snap.rows[0].last_event_id,
            updatedAt: snap.rows[0].updated_at,
          }
        : null,
      evidence: evidence.rows.map((r) => r.item),
      runs: runs.rows,
    });
  });

  app.get('/markets/:id/rules', async (req, reply) => {
    const p = requireScope(req, 'read');
    const { id } = parse(IdParam, req.params);
    const r = await db.query(
      'SELECT rule_no, body FROM market_rules WHERE tenant_id = $1 AND market_id = $2 ORDER BY rule_no',
      [p.tenantId, id],
    );
    if (!r.rowCount) throw new ApiError(404, 'MARKET_NOT_FOUND', id);
    return ok(req, reply, r.rows);
  });

  app.get('/portfolio/:id', async (req, reply) => {
    const p = requireScope(req, 'read');
    const { id } = parse(IdParam, req.params);
    if (p.kind === 'agent' && p.actorId !== id)
      throw new ApiError(403, 'FORBIDDEN', 'agents may read only their own portfolio');
    const r = await db.query(
      'SELECT view, applied_events, updated_at FROM portfolio_snapshots WHERE tenant_id = $1 AND owner_id = $2',
      [p.tenantId, id],
    );
    const ledger = await db.query(
      `SELECT t.tx_id, t.reason, t.order_id, t.correlation_id, t.created_at, e.direction, e.amount, e.account_id
         FROM ledger_entries e JOIN ledger_transactions t USING (tenant_id, tx_id)
        WHERE e.tenant_id = $1 AND e.account_id IN ($2, $3) ORDER BY t.seq DESC, e.entry_no LIMIT 50`,
      [p.tenantId, `agent:${id}:available`, `agent:${id}:reserved`],
    );
    return ok(req, reply, { ownerId: id, projection: r.rows[0] ?? null, ledger: ledger.rows });
  });

  app.get('/activity', async (req, reply) => {
    const p = requireScope(req, 'read');
    const q = parse(z.object({ limit: Limit, correlationId: Id.optional() }), req.query);
    const r = await db.query(
      `SELECT event_id, outbox_id, type, correlation_id, actor_id, status, summary, occurred_at FROM activity_feed
        WHERE tenant_id = $1 AND ($2::text IS NULL OR correlation_id = $2) ORDER BY outbox_id DESC LIMIT $3`,
      [p.tenantId, q.correlationId ?? null, q.limit],
    );
    return ok(req, reply, r.rows);
  });

  app.get('/runs/:id', async (req, reply) => {
    const p = requireScope(req, 'read');
    const { id } = parse(IdParam, req.params);
    const run = await db.query(
      `SELECT r.*, pol.policy FROM agent_runs r JOIN agent_policies pol USING (tenant_id, agent_id) WHERE r.tenant_id = $1 AND r.run_id = $2`,
      [p.tenantId, id],
    );
    if (!run.rows[0]) throw new ApiError(404, 'RUN_NOT_FOUND', id);
    const approvals = await db.query(
      'SELECT approval_id, status, request, decided_by, decided_at FROM approval_requests WHERE tenant_id = $1 AND run_id = $2',
      [p.tenantId, id],
    );
    const trace = await traceByCorrelation(db, p.tenantId, run.rows[0].correlation_id);
    return ok(req, reply, { run: run.rows[0], approvals: approvals.rows, trace });
  });

  app.get('/trace/:id', async (req, reply) => {
    const p = requireScope(req, 'read');
    const { id } = parse(IdParam, req.params);
    return ok(req, reply, await traceByCorrelation(db, p.tenantId, id));
  });

  app.get('/fixtures', async (req, reply) => {
    requireScope(req, 'read');
    const out = [];
    for (const v of await listFixtures()) {
      const f = await loadFixture(v);
      out.push({
        fixtureVersion: v,
        fixtureKey: f.manifest.fixtureKey,
        description: f.manifest.description,
        marketId: f.manifest.market.marketId,
        scenarios: f.scenarios.map(({ scenarioId, agentId, title, description }) => ({
          scenarioId,
          agentId,
          title,
          description,
        })),
      });
    }
    return ok(req, reply, out);
  });

  app.get('/evaluations', async (req, reply) => {
    const p = requireScope(req, 'read');
    const r = await db.query(
      `SELECT evaluation_id, fixture_version, replay_tenant, report, report_hash, correlation_id, created_at
         FROM evaluation_runs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [p.tenantId],
    );
    return ok(req, reply, r.rows);
  });

  app.get('/dead-letters', async (req, reply) => {
    requireScope(req, 'read');
    const r = await db.query(
      'SELECT consumer, event_id, attempts, error, created_at FROM dead_letters ORDER BY id DESC LIMIT 50',
    );
    return ok(req, reply, r.rows);
  });
}
