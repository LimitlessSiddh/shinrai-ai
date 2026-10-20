import { z } from 'zod';
import { CreditCents, Id, IsoTime, Outcome, PriceCents, Quantity } from './primitives';

/** The only tools an agent can ever call. There is no SQL, shell, HTTP or privileged tool. */
export const ToolName = z.enum([
  'getMarket',
  'getRules',
  'getPortfolio',
  'searchEvidence',
  'requestOrder',
]);
export type ToolName = z.infer<typeof ToolName>;

export const AgentPolicy = z.strictObject({
  agentId: Id,
  allowedTools: z.array(ToolName),
  marketScope: z.array(Id),
  /** Total order cost (credit-cents) one run may commit. */
  budget: CreditCents,
  maxOrderQuantity: Quantity,
  /** Orders costing more than this need a human approval record; null disables approval. */
  approvalThreshold: CreditCents.nullable(),
  runDeadlineSeconds: z.number().int().positive().max(3600),
});
export type AgentPolicy = z.infer<typeof AgentPolicy>;

export const Evidence = z.strictObject({
  evidenceId: Id,
  marketId: Id,
  title: z.string().max(120),
  summary: z.string().max(400),
  source: z.string().max(120),
  publishedAt: IsoTime,
  stance: z.enum(['supports_yes', 'supports_no', 'neutral']),
});
export type Evidence = z.infer<typeof Evidence>;

const MarketIdInput = z.strictObject({ marketId: Id });

export const ToolSchemas = {
  getMarket: {
    input: MarketIdInput,
    output: z.strictObject({
      marketId: Id,
      question: z.string(),
      yesMeans: z.string(),
      status: z.enum(['open', 'resolved']),
      homeTeam: z.string(),
      awayTeam: z.string(),
      tipoffAt: IsoTime,
      bestAsk: z.strictObject({ YES: PriceCents.nullable(), NO: PriceCents.nullable() }),
      lastYesPrice: PriceCents.nullable(),
    }),
  },
  getRules: {
    input: MarketIdInput,
    output: z.strictObject({ marketId: Id, rules: z.array(z.string()) }),
  },
  getPortfolio: {
    input: z.strictObject({}),
    output: z.strictObject({
      available: CreditCents,
      reserved: CreditCents,
      positions: z.array(
        z.strictObject({
          marketId: Id,
          outcome: Outcome,
          quantity: z.number().int(),
          cost: CreditCents,
        }),
      ),
    }),
  },
  searchEvidence: {
    input: z.strictObject({ marketId: Id, query: z.string().min(1).max(120) }),
    output: z.strictObject({ items: z.array(Evidence).max(10) }),
  },
  requestOrder: {
    input: z.strictObject({
      marketId: Id,
      outcome: Outcome,
      price: PriceCents,
      quantity: Quantity,
      probabilityYes: z.number().min(0).max(1),
      rationale: z.string().min(1).max(500),
      evidenceIds: z.array(Id).min(1).max(10),
    }),
    output: z.strictObject({
      status: z.enum(['accepted', 'rejected', 'blocked', 'approval_required']),
      orderId: Id.nullable(),
      filledQuantity: z.number().int().nonnegative(),
      reasons: z.array(z.string()),
      correlationId: Id,
    }),
  },
} as const satisfies Record<ToolName, { input: z.ZodType; output: z.ZodType }>;

export type ToolInput<T extends ToolName> = z.infer<(typeof ToolSchemas)[T]['input']>;
export type ToolOutput<T extends ToolName> = z.infer<(typeof ToolSchemas)[T]['output']>;

/** What the model may say at the end of a run. */
export const AgentConclusion = z.strictObject({
  probabilityYes: z.number().min(0).max(1),
  thesis: z.string().min(1).max(500),
  evidenceIds: z.array(Id).max(10),
});
export type AgentConclusion = z.infer<typeof AgentConclusion>;

/** One scripted step for the deterministic fake model; the real model produces the same shape. */
export const ModelAction = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tool'), tool: z.string().max(64), args: z.unknown() }),
  z.strictObject({ kind: z.literal('conclude'), conclusion: AgentConclusion }),
]);
export type ModelAction = z.infer<typeof ModelAction>;
