import type { AgentConclusion, DomainEvent } from '@shinrai/contracts';
import type { ApprovalRecord, RunRecord, RunRecorder, ToolCallRecord } from './ports';

/** In-memory RunRecorder for offline evaluation and unit tests. */
export class MemoryRecorder implements RunRecorder {
  readonly runs: (RunRecord & { status: string; conclusion: AgentConclusion | null })[] = [];
  readonly calls: ToolCallRecord[] = [];
  readonly approvals: ApprovalRecord[] = [];
  readonly events: DomainEvent[] = [];

  async startRun(run: RunRecord) {
    this.runs.push({ ...run, status: 'running', conclusion: null });
  }
  async recordToolCall(call: ToolCallRecord, event: DomainEvent) {
    this.calls.push(call);
    this.events.push(event);
  }
  async requestApproval(a: ApprovalRecord) {
    this.approvals.push(a);
  }
  async finishRun(
    run: RunRecord,
    status: 'completed' | 'failed',
    conclusion: AgentConclusion | null,
    _at: string,
    event: DomainEvent,
  ) {
    const r = this.runs.find((x) => x.runId === run.runId);
    if (r) Object.assign(r, { status, conclusion });
    this.events.push(event);
  }
}
