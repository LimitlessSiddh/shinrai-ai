import { z } from 'zod';

/** Opaque identifier: letters, digits and a few separators. Never free text. */
export const Id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9:_.-]+$/, 'invalid identifier');

export const IsoTime = z.iso.datetime({ offset: true });

export const Outcome = z.enum(['YES', 'NO']);
export type Outcome = z.infer<typeof Outcome>;

/** Limit price in cents per contract. A winning contract pays 100. */
export const PriceCents = z.number().int().min(1).max(99);

/** Whole contracts. */
export const Quantity = z.number().int().min(1).max(100_000);

/** Paper credits in integer credit-cents (1 credit = 100). Never floats. */
export const CreditCents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const ActorKind = z.enum(['human', 'agent', 'system']);
export type ActorKind = z.infer<typeof ActorKind>;

export const Actor = z.strictObject({ tenantId: Id, actorId: Id, kind: ActorKind });
export type Actor = z.infer<typeof Actor>;

export const Scope = z.enum(['read', 'trade', 'agent', 'resolve', 'replay', 'approve']);
export type Scope = z.infer<typeof Scope>;

export const Principal = Actor.extend({ scopes: z.array(Scope) });
export type Principal = z.infer<typeof Principal>;

/** Metadata every state-changing command carries. */
export const CommandMeta = z.strictObject({
  idempotencyKey: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9:_.-]+$/),
  correlationId: Id,
  causationId: Id,
  actor: Actor,
  issuedAt: IsoTime,
});
export type CommandMeta = z.infer<typeof CommandMeta>;

export const RejectionCode = z.enum([
  'VALIDATION_FAILED',
  'FORBIDDEN',
  'MARKET_NOT_FOUND',
  'MARKET_NOT_OPEN',
  'MARKET_ALREADY_EXISTS',
  'INSUFFICIENT_CREDITS',
  'ORDER_NOT_FOUND',
  'ORDER_NOT_CANCELLABLE',
  'RESOLUTION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'POLICY_BLOCKED',
  'APPROVAL_REQUIRED',
]);
export type RejectionCode = z.infer<typeof RejectionCode>;
