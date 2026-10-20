import { z } from 'zod';
import { Id, RejectionCode } from './primitives';
import { CommandTypeName, DomainEvent } from './events';

export const AcceptedResult = z.strictObject({
  status: z.literal('accepted'),
  commandType: CommandTypeName,
  correlationId: Id,
  event: DomainEvent,
  /** True when an idempotency key matched and the stored original result was returned. */
  replayed: z.boolean(),
});

export const RejectedResult = z.strictObject({
  status: z.literal('rejected'),
  commandType: CommandTypeName,
  correlationId: Id,
  code: RejectionCode,
  message: z.string(),
  eventId: Id.nullable(),
  replayed: z.boolean(),
});

export const CommandResult = z.discriminatedUnion('status', [AcceptedResult, RejectedResult]);
export type CommandResult = z.infer<typeof CommandResult>;
export type AcceptedResult = z.infer<typeof AcceptedResult>;
export type RejectedResult = z.infer<typeof RejectedResult>;
