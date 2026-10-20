import type { AgentPolicy } from '@shinrai/contracts';

export type PolicyReason = { code: string; message: string };
export type PolicyDecision =
  | { decision: 'approved'; reasons: PolicyReason[] }
  | { decision: 'blocked'; reasons: PolicyReason[] }
  | { decision: 'approval_required'; reasons: PolicyReason[] };

export type RunClock = { now: string; startedAt: string };

export function deadlineExceeded(policy: AgentPolicy, clock: RunClock): boolean {
  return Date.parse(clock.now) - Date.parse(clock.startedAt) > policy.runDeadlineSeconds * 1000;
}

/** Tool access gate: allowlist and run deadline. Applied before any tool input reaches a handler. */
export function checkToolAccess(
  policy: AgentPolicy,
  tool: string,
  clock: RunClock,
): PolicyReason[] {
  const reasons: PolicyReason[] = [];
  if (!(policy.allowedTools as string[]).includes(tool)) {
    reasons.push({
      code: 'TOOL_NOT_ALLOWED',
      message: `tool "${tool}" is not on this agent's allowlist`,
    });
  }
  if (deadlineExceeded(policy, clock)) {
    reasons.push({
      code: 'RUN_DEADLINE_EXCEEDED',
      message: `run exceeded its ${policy.runDeadlineSeconds}s deadline`,
    });
  }
  return reasons;
}

export function checkMarketScope(policy: AgentPolicy, marketId: string): PolicyReason[] {
  return policy.marketScope.includes(marketId)
    ? []
    : [
        {
          code: 'MARKET_OUT_OF_SCOPE',
          message: `market ${marketId} is outside this agent's scope`,
        },
      ];
}

export type OrderRequest = { marketId: string; price: number; quantity: number };

/**
 * Deterministic order policy. Every reason is collected so an operator sees all violations at once.
 * `committed` is the cost of orders this run has already had accepted.
 */
export function evaluateOrderPolicy(
  policy: AgentPolicy,
  req: OrderRequest,
  ctx: RunClock & { committed: number; approved: boolean },
): PolicyDecision {
  const cost = req.price * req.quantity;
  const reasons: PolicyReason[] = [...checkMarketScope(policy, req.marketId)];
  if (req.quantity > policy.maxOrderQuantity) {
    reasons.push({
      code: 'ORDER_SIZE_EXCEEDED',
      message: `quantity ${req.quantity} exceeds cap ${policy.maxOrderQuantity}`,
    });
  }
  if (ctx.committed + cost > policy.budget) {
    reasons.push({
      code: 'BUDGET_EXCEEDED',
      message: `cost ${cost} plus committed ${ctx.committed} exceeds run budget ${policy.budget}`,
    });
  }
  if (deadlineExceeded(policy, ctx)) {
    reasons.push({
      code: 'RUN_DEADLINE_EXCEEDED',
      message: `run exceeded its ${policy.runDeadlineSeconds}s deadline`,
    });
  }
  if (reasons.length) return { decision: 'blocked', reasons };
  if (policy.approvalThreshold !== null && cost > policy.approvalThreshold && !ctx.approved) {
    return {
      decision: 'approval_required',
      reasons: [
        {
          code: 'APPROVAL_REQUIRED',
          message: `cost ${cost} exceeds approval threshold ${policy.approvalThreshold}`,
        },
      ],
    };
  }
  return {
    decision: 'approved',
    reasons: [
      {
        code: 'WITHIN_POLICY',
        message: `budget ${ctx.committed + cost} / ${policy.budget}, size ${req.quantity} / ${policy.maxOrderQuantity}`,
      },
    ],
  };
}
