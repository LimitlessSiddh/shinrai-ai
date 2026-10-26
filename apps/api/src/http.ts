import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Id, type Principal, type Scope } from '@shinrai/contracts';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
    principal: Principal | null;
  }
}

/** A typed, expected failure. Never a 500. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Accepts a caller's `x-correlation-id` only when it is a safe identifier; otherwise mints one. */
export function correlationFor(req: FastifyRequest): string {
  const header = req.headers['x-correlation-id'];
  const parsed = Id.safeParse(Array.isArray(header) ? header[0] : header);
  return parsed.success ? parsed.data : `corr_${randomUUID()}`;
}

export function authenticate(
  req: FastifyRequest,
  tokens: Map<string, Principal>,
): Principal | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return tokens.get(auth.slice('Bearer '.length).trim()) ?? null;
}

export function requireScope(req: FastifyRequest, scope: Scope): Principal {
  if (!req.principal)
    throw new ApiError(401, 'UNAUTHENTICATED', 'a valid bearer token is required');
  if (!req.principal.scopes.includes(scope))
    throw new ApiError(403, 'FORBIDDEN', `missing scope "${scope}"`);
  return req.principal;
}

/** Strict schema parse at the HTTP boundary; failures become 422 VALIDATION_FAILED. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const detail = r.error.issues
      .map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`)
      .join('; ');
    throw new ApiError(422, 'VALIDATION_FAILED', detail);
  }
  return r.data;
}

export const ok = (req: FastifyRequest, reply: FastifyReply, data: unknown, status = 200) =>
  reply.status(status).send({ data, correlationId: req.correlationId });

/** Domain rejection codes -> HTTP status. Expected business outcomes, never server errors. */
export const REJECTION_STATUS: Record<string, number> = {
  VALIDATION_FAILED: 422,
  FORBIDDEN: 403,
  MARKET_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  MARKET_NOT_OPEN: 409,
  MARKET_ALREADY_EXISTS: 409,
  ORDER_NOT_CANCELLABLE: 409,
  RESOLUTION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INSUFFICIENT_CREDITS: 422,
  POLICY_BLOCKED: 422,
  APPROVAL_REQUIRED: 202,
};
