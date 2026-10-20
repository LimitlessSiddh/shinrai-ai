import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { loadFixture, runPersistedReplay } from '@shinrai/adapters';
import {
  CancelOrderRequest,
  Id,
  PlaceOrderRequest,
  ResolveMarketRequest,
  type CommandPayload,
  type CommandResult,
  type Principal,
  type Scope,
} from '@shinrai/contracts';
import { decideApproval, seed, startRun, type Services } from './agents';
import { ApiError, ok, parse, REJECTION_STATUS, requireScope } from './http';

const IdParam = z.strictObject({ id: Id });
const VersionParam = z.strictObject({ version: z.string().regex(/^[a-z0-9.-]{1,64}$/) });

/** Builds the command envelope from the authenticated principal: clients never choose actor or tenant. */
async function submit(
  s: Services,
  req: FastifyRequest,
  reply: FastifyReply,
  principal: Principal,
  scope: Scope,
  idempotencyKey: string,
  payload: CommandPayload,
) {
  const result: CommandResult = await s.exchange.execute(
    {
      meta: {
        idempotencyKey,
        correlationId: req.correlationId,
        causationId: `http_${randomUUID()}`,
        actor: { tenantId: principal.tenantId, actorId: principal.actorId, kind: principal.kind },
        issuedAt: new Date().toISOString(),
      },
      payload,
    },
    {
      decision: 'approved',
      reasons: [{ code: 'SCOPE_GRANTED', message: `${principal.actorId} holds scope "${scope}"` }],
    },
  );
  if (result.status === 'rejected') {
    return reply.status(REJECTION_STATUS[result.code] ?? 422).send({
      error: { code: result.code, message: result.message },
      data: result,
      correlationId: req.correlationId,
    });
  }
  return ok(req, reply, result, result.replayed ? 200 : 201);
}

export function commandRoutes(app: FastifyInstance, s: Services) {
  app.post('/orders', async (req, reply) => {
    const p = requireScope(req, 'trade');
    // Agents never trade over HTTP: their only write path is a gateway run with agent policy.
    if (p.kind === 'agent')
      throw new ApiError(403, 'FORBIDDEN', 'agents must request orders through an agent run');
    const body = parse(PlaceOrderRequest, req.body);
    const { idempotencyKey, ...order } = body;
    return submit(s, req, reply, p, 'trade', idempotencyKey, { type: 'PlaceOrder', ...order });
  });

  app.post('/orders/:id/cancel', async (req, reply) => {
    const p = requireScope(req, 'trade');
    const { id } = parse(IdParam, req.params);
    const { idempotencyKey } = parse(CancelOrderRequest, req.body);
    return submit(s, req, reply, p, 'trade', idempotencyKey, { type: 'CancelOrder', orderId: id });
  });

  app.post('/markets/:id/resolve', async (req, reply) => {
    const p = requireScope(req, 'resolve');
    const { id } = parse(IdParam, req.params);
    const { idempotencyKey, ...body } = parse(ResolveMarketRequest, req.body);
    return submit(s, req, reply, p, 'resolve', idempotencyKey, {
      type: 'ResolveMarket',
      marketId: id,
      ...body,
    });
  });

  app.post('/fixtures/:version/seed', async (req, reply) => {
    const p = requireScope(req, 'replay');
    const { version } = parse(VersionParam, req.params);
    return ok(req, reply, await seed(s, p, version), 201);
  });

  app.post('/agent-runs', async (req, reply) => {
    const p = requireScope(req, 'replay');
    const body = parse(
      z.strictObject({
        fixtureVersion: VersionParam.shape.version,
        scenarioId: Id,
        model: z.enum(['fake', 'openai']).default('fake'),
      }),
      req.body,
    );
    return ok(req, reply, await startRun(s, p, body, req.correlationId), 201);
  });

  app.post('/approvals/:id/:decision', async (req, reply) => {
    const p = requireScope(req, 'approve');
    const { id, decision } = parse(
      z.strictObject({ id: Id, decision: z.enum(['approve', 'reject']) }),
      req.params,
    );
    return ok(req, reply, await decideApproval(s, p, id, decision === 'approve'));
  });

  app.post('/replays', async (req, reply) => {
    const p = requireScope(req, 'replay');
    const { fixtureVersion } = parse(
      z.strictObject({ fixtureVersion: VersionParam.shape.version }),
      req.body,
    );
    const fixture = await loadFixture(fixtureVersion).catch(() => {
      throw new ApiError(404, 'FIXTURE_NOT_FOUND', `fixture ${fixtureVersion} not found`);
    });
    const ev = await runPersistedReplay(s.pool, fixture, {
      tenantId: p.tenantId,
      correlationId: req.correlationId,
    });
    return ok(req, reply, ev, 201);
  });
}
