import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { createPool, PostgresExchange, type Pool } from '@shinrai/adapters';
import { loggerOptions, withCorrelation } from '@shinrai/observability';
import type { Services } from './agents';
import type { Config } from './config';
import { ApiError, authenticate, correlationFor } from './http';
import { commandRoutes } from './routes-commands';
import { queryRoutes } from './routes-queries';

export async function buildApp(
  config: Config,
  pool: Pool = createPool(config.databaseUrl),
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions('api'),
    bodyLimit: 64 * 1024,
  });
  const services: Services = {
    pool,
    exchange: new PostgresExchange(pool, {
      onRetry: (i) => app.log.warn(i, 'serializable retry'),
    }),
    config,
  };

  await app.register(cors, {
    origin: config.webOrigin,
    allowedHeaders: ['authorization', 'content-type', 'x-correlation-id'],
    exposedHeaders: ['x-correlation-id'],
  });

  app.decorateRequest('correlationId', '');
  app.decorateRequest('principal', null);
  app.addHook('onRequest', async (req, reply) => {
    req.correlationId = correlationFor(req);
    req.principal = authenticate(req, config.tokens);
    reply.header('x-correlation-id', req.correlationId);
  });
  // Every log line and span inside the handler carries the correlation id.
  app.addHook('preHandler', (req, _reply, done) =>
    withCorrelation({ correlationId: req.correlationId }, done),
  );

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send({
        error: { code: err.code, message: err.message },
        correlationId: req.correlationId,
      });
    }
    const e = err as Error & { statusCode?: number };
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(e.statusCode).send({
        error: { code: 'BAD_REQUEST', message: e.message },
        correlationId: req.correlationId,
      });
    }
    req.log.error({ err, correlationId: req.correlationId }, 'unhandled error');
    return reply.status(500).send({
      error: { code: 'INTERNAL', message: 'internal error' },
      correlationId: req.correlationId,
    });
  });
  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `${req.method} ${req.url}` },
      correlationId: req.correlationId,
    }),
  );

  queryRoutes(app, services);
  commandRoutes(app, services);
  app.addHook('onClose', async () => {
    await pool.end();
  });
  return app;
}
