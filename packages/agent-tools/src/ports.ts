import type { AgentConclusion, DomainEvent, Evidence, ToolInput } from '@shinrai/contracts';
import type { Clock, Exchange, IdSource, PolicyReason } from '@shinrai/domain';

export type PolicyOutcome = 'approved' | 'blocked' | 'approval_required' | 'not_applicable';

export type RunRecord = {
  tenantId: string;
  runId: string;
  agentId: string;
  marketId: string;
  scenario: string;
  model: string;
  correlationId: string;
  startedAt: string;
};

export type ToolCallRecord = {
  tenantId: string;
  toolCallId: string;
  runId: string;
  seq: number;
  tool: string;
  input: unknown;
  output: unknown;
  ok: boolean;
  policyDecision: PolicyOutcome;
  reasons: PolicyReason[];
  commandCorrelationId: string | null;
  createdAt: string;
};

export type ApprovalRecord = {
  tenantId: string;
  approvalId: string;
  runId: string;
  toolCallId: string;
  request: ToolInput<'requestOrder'>;
  createdAt: string;
};

/** Durable record of runs, tool calls and approvals. Each record also emits its outbox event. */
export interface RunRecorder {
  startRun(run: RunRecord): Promise<void>;
  recordToolCall(call: ToolCallRecord, event: DomainEvent): Promise<void>;
  requestApproval(approval: ApprovalRecord): Promise<void>;
  finishRun(
    run: RunRecord,
    status: 'completed' | 'failed',
    conclusion: AgentConclusion | null,
    finishedAt: string,
    event: DomainEvent,
  ): Promise<void>;
}

export interface EvidenceSource {
  forMarket(tenantId: string, marketId: string): Promise<Evidence[]>;
}

/** Everything the gateway may touch. Note what is absent: no database, shell, network or ledger. */
export type GatewayDeps = {
  exchange: Exchange;
  evidence: EvidenceSource;
  recorder: RunRecorder;
  ids: IdSource;
  clock: Clock;
};
