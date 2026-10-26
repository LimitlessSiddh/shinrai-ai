import {
  EVENT_SCHEMA_VERSION,
  ToolName,
  ToolSchemas,
  type AgentConclusion,
  type AgentPolicy,
  type DomainEvent,
  type Evidence,
  type ToolInput,
} from '@shinrai/contracts';
import {
  checkMarketScope,
  checkToolAccess,
  evaluateOrderPolicy,
  type PolicyReason,
} from '@shinrai/domain';
import type { ApprovalRecord, GatewayDeps, PolicyOutcome, RunRecord } from './ports';

export type ToolResult =
  | { ok: true; output: unknown }
  | { ok: false; error: { code: string; message: string; reasons: PolicyReason[] } };

/** Ranks fixture evidence for a query: any query token in title/summary, newest first, stable ids. */
export function searchEvidence(items: readonly Evidence[], query: string): Evidence[] {
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 1);
  return items
    .filter((e) => tokens.some((t) => `${e.title} ${e.summary}`.toLowerCase().includes(t)))
    .sort(
      (a, b) =>
        b.publishedAt.localeCompare(a.publishedAt) || a.evidenceId.localeCompare(b.evidenceId),
    )
    .slice(0, 10);
}

const reasonStrings = (rs: PolicyReason[]) => rs.map((r) => `${r.code}: ${r.message}`);

/**
 * One bounded agent run. Every tool call passes, in order:
 * name allowlist -> run deadline -> strict input schema -> market scope -> (orders) policy + citation check
 * -> the same command path humans use. Each call is recorded with its policy decision under the run's
 * correlation id. Nothing here can reach SQL, a shell, the network, the ledger or settlement.
 */
export class AgentRun {
  readonly record: RunRecord;
  private seq = 0;
  private committed = 0;
  private readonly retrieved = new Set<string>();
  private readonly startedAt: string;
  private pendingApproval: ApprovalRecord | null = null;

  constructor(
    private readonly deps: GatewayDeps,
    readonly policy: AgentPolicy,
    init: {
      tenantId: string;
      marketId: string;
      scenario: string;
      model: string;
      correlationId?: string;
    },
  ) {
    const runId = deps.ids.next('run');
    this.startedAt = deps.clock.now();
    this.record = {
      tenantId: init.tenantId,
      runId,
      agentId: policy.agentId,
      marketId: init.marketId,
      scenario: init.scenario,
      model: init.model,
      correlationId: init.correlationId ?? `corr-${runId}`,
      startedAt: this.startedAt,
    };
  }

  start() {
    return this.deps.recorder.startRun(this.record);
  }

  private event<T extends 'agent.tool.called' | 'agent.run.completed'>(
    type: T,
    causationId: string,
    occurredAt: string,
    payload: Extract<DomainEvent, { type: T }>['payload'],
  ): DomainEvent {
    return {
      eventId: this.deps.ids.next('evt'),
      type,
      schemaVersion: EVENT_SCHEMA_VERSION,
      occurredAt,
      tenantId: this.record.tenantId,
      aggregateId: this.record.runId,
      correlationId: this.record.correlationId,
      causationId,
      actor: { tenantId: this.record.tenantId, actorId: this.policy.agentId, kind: 'agent' },
      payload,
    } as DomainEvent;
  }

  async invoke(tool: string, rawArgs: unknown): Promise<ToolResult> {
    const now = this.deps.clock.now();
    const toolCallId = this.deps.ids.next('call');
    const seq = ++this.seq;
    const clock = { now, startedAt: this.startedAt };
    let policyDecision: PolicyOutcome = 'not_applicable';
    let reasons: PolicyReason[];
    let commandCorrelationId: string | null = null;
    let result: ToolResult;

    const fail = (code: string, message: string, rs: PolicyReason[] = []): ToolResult => ({
      ok: false,
      error: { code, message, reasons: rs },
    });

    const name = ToolName.safeParse(tool);
    const access = checkToolAccess(this.policy, tool, clock);
    if (!name.success || access.length) {
      policyDecision = 'blocked';
      reasons = access.length
        ? access
        : [{ code: 'TOOL_NOT_ALLOWED', message: `unknown tool "${tool}"` }];
      result = fail('POLICY_BLOCKED', 'tool call blocked by policy', reasons);
    } else {
      const parsed = ToolSchemas[name.data].input.safeParse(rawArgs);
      if (!parsed.success) {
        reasons = [
          {
            code: 'VALIDATION_FAILED',
            message: parsed.error.issues
              .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
              .join('; '),
          },
        ];
        result = fail('VALIDATION_FAILED', 'tool input does not match its schema', reasons);
      } else {
        const out = await this.execute(name.data, parsed.data as never, now, toolCallId, seq);
        ({ result, policyDecision, reasons, commandCorrelationId } = out);
      }
    }

    if (result.ok && ToolName.safeParse(tool).success) {
      // Defensive: tools may only return what their output schema allows.
      result = { ok: true, output: ToolSchemas[tool as ToolName].output.parse(result.output) };
    }

    const event = this.event('agent.tool.called', toolCallId, now, {
      runId: this.record.runId,
      toolCallId,
      tool: tool.slice(0, 64),
      ok: result.ok,
      policy: policyDecision === 'approval_required' ? 'blocked' : policyDecision,
      reasons: reasonStrings(reasons),
    });
    await this.deps.recorder.recordToolCall(
      {
        tenantId: this.record.tenantId,
        toolCallId,
        runId: this.record.runId,
        seq,
        tool: tool.slice(0, 64),
        input: rawArgs ?? null,
        output: result.ok ? result.output : result.error,
        ok: result.ok,
        policyDecision,
        reasons,
        commandCorrelationId,
        createdAt: now,
      },
      event,
    );
    if (this.pendingApproval) {
      await this.deps.recorder.requestApproval(this.pendingApproval);
      this.pendingApproval = null;
    }
    return result;
  }

  private async execute(
    tool: ToolName,
    input: ToolInput<ToolName>,
    now: string,
    toolCallId: string,
    seq: number,
  ): Promise<{
    result: ToolResult;
    policyDecision: PolicyOutcome;
    reasons: PolicyReason[];
    commandCorrelationId: string | null;
  }> {
    const { exchange, evidence } = this.deps;
    const tenantId = this.record.tenantId;
    const none = {
      policyDecision: 'not_applicable' as const,
      reasons: [],
      commandCorrelationId: null,
    };
    const blocked = (rs: PolicyReason[]) => ({
      result: {
        ok: false as const,
        error: { code: 'POLICY_BLOCKED', message: 'blocked by agent policy', reasons: rs },
      },
      policyDecision: 'blocked' as const,
      reasons: rs,
      commandCorrelationId: null,
    });

    if ('marketId' in input) {
      const scope = checkMarketScope(this.policy, input.marketId);
      if (scope.length) return blocked(scope);
    }

    switch (tool) {
      case 'getMarket': {
        const { marketId } = input as ToolInput<'getMarket'>;
        const v = await exchange.getMarket(tenantId, marketId);
        if (!v)
          return {
            result: {
              ok: false,
              error: { code: 'MARKET_NOT_FOUND', message: marketId, reasons: [] },
            },
            ...none,
          };
        const m = v.market;
        return {
          result: {
            ok: true,
            output: {
              marketId: m.marketId,
              question: m.question,
              yesMeans: m.yesMeans,
              status: m.status,
              homeTeam: `${m.homeTeam.name} (${m.homeTeam.code})`,
              awayTeam: `${m.awayTeam.name} (${m.awayTeam.code})`,
              tipoffAt: m.tipoffAt,
              bestAsk: v.bestAsk,
              lastYesPrice: v.lastYesPrice,
            },
          },
          ...none,
        };
      }
      case 'getRules': {
        const { marketId } = input as ToolInput<'getRules'>;
        const v = await exchange.getMarket(tenantId, marketId);
        if (!v)
          return {
            result: {
              ok: false,
              error: { code: 'MARKET_NOT_FOUND', message: marketId, reasons: [] },
            },
            ...none,
          };
        return { result: { ok: true, output: { marketId, rules: v.market.rules } }, ...none };
      }
      case 'getPortfolio': {
        // Always the calling agent's own portfolio: there is no argument to name anyone else.
        const p = await exchange.getPortfolio(tenantId, this.policy.agentId);
        return {
          result: {
            ok: true,
            output: {
              available: p.available,
              reserved: p.reserved,
              positions: p.positions.map(({ marketId, outcome, quantity, cost }) => ({
                marketId,
                outcome,
                quantity,
                cost,
              })),
            },
          },
          ...none,
        };
      }
      case 'searchEvidence': {
        const { marketId, query } = input as ToolInput<'searchEvidence'>;
        const items = searchEvidence(await evidence.forMarket(tenantId, marketId), query);
        for (const e of items) this.retrieved.add(e.evidenceId);
        return { result: { ok: true, output: { items } }, ...none };
      }
      case 'requestOrder':
        return this.requestOrder(input as ToolInput<'requestOrder'>, now, toolCallId, seq);
    }
  }

  private async requestOrder(
    req: ToolInput<'requestOrder'>,
    now: string,
    toolCallId: string,
    seq: number,
  ) {
    const decision = evaluateOrderPolicy(this.policy, req, {
      now,
      startedAt: this.startedAt,
      committed: this.committed,
      approved: false,
    });
    const uncited = req.evidenceIds.filter((id) => !this.retrieved.has(id));
    const reasons: PolicyReason[] = [...(decision.decision === 'approved' ? [] : decision.reasons)];
    if (uncited.length) {
      reasons.push({
        code: 'EVIDENCE_NOT_RETRIEVED',
        message: `cites evidence never retrieved in this run: ${uncited.join(', ')}`,
      });
    }
    const correlationId = this.record.correlationId;
    const output = (
      status: 'accepted' | 'rejected' | 'blocked' | 'approval_required',
      extra: { orderId?: string; filled?: number; reasons: string[] },
    ) => ({
      status,
      orderId: extra.orderId ?? null,
      filledQuantity: extra.filled ?? 0,
      reasons: extra.reasons,
      correlationId,
    });

    if (reasons.length && (decision.decision === 'blocked' || uncited.length)) {
      return {
        result: {
          ok: false as const,
          error: { code: 'POLICY_BLOCKED', message: 'order blocked by agent policy', reasons },
        },
        policyDecision: 'blocked' as const,
        reasons,
        commandCorrelationId: null,
      };
    }
    if (decision.decision === 'approval_required') {
      // Recorded after the tool call itself (the approval references it).
      this.pendingApproval = {
        tenantId: this.record.tenantId,
        approvalId: this.deps.ids.next('approval'),
        runId: this.record.runId,
        toolCallId,
        request: req,
        createdAt: now,
      };
      return {
        result: {
          ok: true as const,
          output: output('approval_required', { reasons: reasonStrings(decision.reasons) }),
        },
        policyDecision: 'approval_required' as const,
        reasons: decision.reasons,
        commandCorrelationId: null,
      };
    }

    // Approved: the exact command path a human order takes, with a deterministic idempotency key.
    const r = await this.deps.exchange.execute(
      {
        meta: {
          idempotencyKey: `${this.record.runId}-${String(seq).padStart(3, '0')}`,
          correlationId,
          causationId: toolCallId,
          actor: { tenantId: this.record.tenantId, actorId: this.policy.agentId, kind: 'agent' },
          issuedAt: now,
        },
        payload: {
          type: 'PlaceOrder',
          marketId: req.marketId,
          outcome: req.outcome,
          price: req.price,
          quantity: req.quantity,
        },
      },
      { decision: 'approved', reasons: decision.reasons },
    );
    if (r.status === 'accepted' && r.event.type === 'order.placed') {
      this.committed += req.price * req.quantity;
      const o = r.event.payload.order;
      return {
        result: {
          ok: true as const,
          output: output('accepted', {
            orderId: o.orderId,
            filled: o.filledQuantity,
            reasons: reasonStrings(decision.reasons),
          }),
        },
        policyDecision: 'approved' as const,
        reasons: decision.reasons,
        commandCorrelationId: correlationId,
      };
    }
    const why = r.status === 'rejected' ? [`${r.code}: ${r.message}`] : ['unexpected result'];
    return {
      result: { ok: true as const, output: output('rejected', { reasons: why }) },
      policyDecision: 'approved' as const,
      reasons: decision.reasons,
      commandCorrelationId: correlationId,
    };
  }

  async finish(status: 'completed' | 'failed', conclusion: AgentConclusion | null) {
    const now = this.deps.clock.now();
    const event = this.event('agent.run.completed', this.record.runId, now, {
      runId: this.record.runId,
      status,
      probabilityYes: conclusion?.probabilityYes ?? null,
      thesis: conclusion?.thesis ?? null,
    });
    await this.deps.recorder.finishRun(this.record, status, conclusion, now, event);
  }
}
