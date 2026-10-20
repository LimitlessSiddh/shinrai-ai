import { z } from 'zod';
import { type CommandType, MarketDefinition } from './commands';
import { Actor, CreditCents, Id, IsoTime, Outcome, RejectionCode } from './primitives';
import { Fill, Order, Payout } from './records';

export const EVENT_SCHEMA_VERSION = 1;

const event = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.strictObject({
    eventId: Id,
    type: z.literal(type),
    schemaVersion: z.literal(EVENT_SCHEMA_VERSION),
    occurredAt: IsoTime,
    tenantId: Id,
    aggregateId: Id,
    correlationId: Id,
    causationId: Id,
    actor: Actor,
    payload,
  });

export const CommandTypeName = z.enum([
  'OpenMarket',
  'GrantCredits',
  'PlaceOrder',
  'CancelOrder',
  'ResolveMarket',
]) satisfies z.ZodType<CommandType>;

export const MarketOpened = event('market.opened', z.strictObject({ market: MarketDefinition }));
export const CreditsGranted = event(
  'credits.granted',
  z.strictObject({ ownerId: Id, amount: CreditCents, ledgerTxIds: z.array(Id) }),
);
export const OrderPlaced = event(
  'order.placed',
  z.strictObject({ order: Order, fills: z.array(Fill), ledgerTxIds: z.array(Id) }),
);
export const OrderCancelled = event(
  'order.cancelled',
  z.strictObject({ orderId: Id, marketId: Id, released: CreditCents, ledgerTxIds: z.array(Id) }),
);
export const MarketResolved = event(
  'market.resolved',
  z.strictObject({
    marketId: Id,
    winningOutcome: Outcome,
    source: z.string(),
    payouts: z.array(Payout),
    cancelledOrderIds: z.array(Id),
    ledgerTxIds: z.array(Id),
  }),
);
export const CommandRejected = event(
  'command.rejected',
  z.strictObject({ commandType: CommandTypeName, code: RejectionCode, message: z.string() }),
);
export const AgentToolCalled = event(
  'agent.tool.called',
  z.strictObject({
    runId: Id,
    toolCallId: Id,
    tool: z.string(),
    ok: z.boolean(),
    policy: z.enum(['approved', 'blocked', 'not_applicable']),
    reasons: z.array(z.string()),
  }),
);
export const AgentRunCompleted = event(
  'agent.run.completed',
  z.strictObject({
    runId: Id,
    status: z.enum(['completed', 'failed']),
    probabilityYes: z.number().min(0).max(1).nullable(),
    thesis: z.string().nullable(),
  }),
);

export const DomainEvent = z.discriminatedUnion('type', [
  MarketOpened,
  CreditsGranted,
  OrderPlaced,
  OrderCancelled,
  MarketResolved,
  CommandRejected,
  AgentToolCalled,
  AgentRunCompleted,
]);
export type DomainEvent = z.infer<typeof DomainEvent>;
export type DomainEventType = DomainEvent['type'];
export type EventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;
