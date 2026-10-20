import type { Pool } from '@shinrai/adapters';

/**
 * Everything recorded under one correlation id, in causal order:
 * agent run -> tool calls (policy) -> command audit -> ledger transactions -> outbox events
 * -> deliveries/projection -> evaluation. Read-only, tenant-scoped, parameterized.
 */
export async function traceByCorrelation(pool: Pool, tenantId: string, correlationId: string) {
  const q = async (sql: string) => (await pool.query(sql, [tenantId, correlationId])).rows;
  const [runs, toolCalls, audit, ledger, events, activity, evaluations] = await Promise.all([
    q(`SELECT run_id, agent_id, market_id, scenario, model, status, started_at, finished_at, conclusion
         FROM agent_runs WHERE tenant_id = $1 AND correlation_id = $2 ORDER BY started_at`),
    q(`SELECT c.tool_call_id, c.run_id, c.seq, c.tool, c.input, c.output, c.ok, c.policy_decision, c.reasons, c.created_at
         FROM agent_tool_calls c JOIN agent_runs r USING (tenant_id, run_id)
        WHERE c.tenant_id = $1 AND r.correlation_id = $2 ORDER BY c.run_id, c.seq`),
    q(`SELECT id, actor, command_type, outcome, policy, rejection_code, event_id, causation_id, created_at
         FROM audit_log WHERE tenant_id = $1 AND correlation_id = $2 ORDER BY id`),
    q(`SELECT t.tx_id, t.reason, t.order_id, t.event_id, t.created_at,
              json_agg(json_build_object('entryNo', e.entry_no, 'accountId', e.account_id, 'direction', e.direction, 'amount', e.amount)
                       ORDER BY e.entry_no) AS entries
         FROM ledger_transactions t JOIN ledger_entries e USING (tenant_id, tx_id)
        WHERE t.tenant_id = $1 AND t.correlation_id = $2
        GROUP BY t.tenant_id, t.tx_id, t.reason, t.order_id, t.event_id, t.created_at, t.seq ORDER BY t.seq`),
    q(`SELECT o.id AS outbox_id, o.event_id, o.type, o.causation_id, o.occurred_at, o.published_at,
              coalesce(json_agg(d.delivered_at) FILTER (WHERE d.event_id IS NOT NULL), '[]') AS deliveries
         FROM outbox_events o LEFT JOIN event_deliveries d ON d.event_id = o.event_id
        WHERE o.tenant_id = $1 AND o.correlation_id = $2 GROUP BY o.id ORDER BY o.id`),
    q(`SELECT event_id, type, status, summary, occurred_at FROM activity_feed
        WHERE tenant_id = $1 AND correlation_id = $2 ORDER BY outbox_id`),
    q(`SELECT evaluation_id, fixture_version, report_hash, created_at FROM evaluation_runs
        WHERE tenant_id = $1 AND correlation_id = $2 ORDER BY created_at`),
  ]);
  return { correlationId, runs, toolCalls, audit, ledger, events, activity, evaluations };
}
