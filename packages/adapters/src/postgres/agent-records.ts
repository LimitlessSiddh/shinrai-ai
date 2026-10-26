import type { AgentPolicy, DomainEvent, Evidence, Fixture } from '@shinrai/contracts';
import type {
  ApprovalRecord,
  EvidenceSource,
  RunRecord,
  RunRecorder,
  ToolCallRecord,
} from '@shinrai/agent-tools';
import { inTransaction, type Client, type Pool } from './pool';

async function insertOutbox(c: Client, e: DomainEvent) {
  await c.query(
    `INSERT INTO outbox_events (tenant_id, event_id, type, aggregate_id, correlation_id, causation_id, event, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [e.tenantId, e.eventId, e.type, e.aggregateId, e.correlationId, e.causationId, e, e.occurredAt],
  );
}

/** Persists agent runs and tool calls; each record and its outbox event commit together. */
export class PgRunRecorder implements RunRecorder {
  constructor(private readonly pool: Pool) {}

  async startRun(r: RunRecord) {
    await this.pool.query(
      `INSERT INTO agent_runs (tenant_id, run_id, agent_id, market_id, scenario, model, status, correlation_id, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'running', $7, $8)`,
      [
        r.tenantId,
        r.runId,
        r.agentId,
        r.marketId,
        r.scenario,
        r.model,
        r.correlationId,
        r.startedAt,
      ],
    );
  }

  async recordToolCall(call: ToolCallRecord, event: DomainEvent) {
    await inTransaction(this.pool, async (c) => {
      await c.query(
        `INSERT INTO agent_tool_calls VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          call.tenantId,
          call.toolCallId,
          call.runId,
          call.seq,
          call.tool,
          JSON.stringify(call.input),
          JSON.stringify(call.output),
          call.ok,
          call.policyDecision,
          JSON.stringify(call.reasons),
          call.commandCorrelationId,
          call.createdAt,
        ],
      );
      await insertOutbox(c, event);
    });
  }

  async requestApproval(a: ApprovalRecord) {
    await this.pool.query(
      `INSERT INTO approval_requests (tenant_id, approval_id, run_id, tool_call_id, request, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
      [a.tenantId, a.approvalId, a.runId, a.toolCallId, a.request, a.createdAt],
    );
  }

  async finishRun(
    r: RunRecord,
    status: 'completed' | 'failed',
    conclusion: unknown,
    finishedAt: string,
    event: DomainEvent,
  ) {
    await inTransaction(this.pool, async (c) => {
      await c.query(
        `UPDATE agent_runs SET status = $3, conclusion = $4, finished_at = $5 WHERE tenant_id = $1 AND run_id = $2`,
        [
          r.tenantId,
          r.runId,
          status,
          conclusion === null ? null : JSON.stringify(conclusion),
          finishedAt,
        ],
      );
      await insertOutbox(c, event);
    });
  }
}

export class PgEvidence implements EvidenceSource {
  constructor(private readonly pool: Pool) {}
  async forMarket(tenantId: string, marketId: string): Promise<Evidence[]> {
    const r = await this.pool.query<{ item: Evidence }>(
      'SELECT item FROM evidence_items WHERE tenant_id = $1 AND market_id = $2 ORDER BY evidence_id',
      [tenantId, marketId],
    );
    return r.rows.map((x) => x.item);
  }
}

/** Registers the fixture version, its evidence and agent policies for a tenant. Idempotent. */
export async function registerFixture(
  pool: Pool,
  tenantId: string,
  fixture: Fixture,
): Promise<void> {
  const m = fixture.manifest;
  await inTransaction(pool, async (c) => {
    await c.query(
      `INSERT INTO fixture_versions (tenant_id, fixture_version, manifest) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [tenantId, m.fixtureVersion, m],
    );
    for (const e of m.evidence) {
      await c.query(
        `INSERT INTO evidence_items VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [tenantId, e.evidenceId, e.marketId, m.fixtureVersion, e],
      );
    }
    for (const p of m.policies) {
      await c.query(
        `INSERT INTO agent_policies (tenant_id, agent_id, policy) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, agent_id) DO UPDATE SET policy = EXCLUDED.policy, updated_at = now()`,
        [tenantId, p.agentId, p],
      );
    }
  });
}

export async function loadPolicy(
  pool: Pool,
  tenantId: string,
  agentId: string,
): Promise<AgentPolicy | null> {
  const r = await pool.query<{ policy: AgentPolicy }>(
    'SELECT policy FROM agent_policies WHERE tenant_id = $1 AND agent_id = $2',
    [tenantId, agentId],
  );
  return r.rows[0]?.policy ?? null;
}
