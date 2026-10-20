import {
  consumeProjectionBatch,
  createPool,
  JetStreamBus,
  migrate,
  relayOutbox,
} from '@shinrai/adapters';
import { createLogger, startTracing, traced } from '@shinrai/observability';

const log = createLogger('worker');
startTracing('shinrai-worker');

const pool = createPool(
  process.env.DATABASE_URL ?? 'postgres://shinrai:shinrai_local@localhost:5432/shinrai',
);
await migrate(pool);
const bus = await JetStreamBus.connect(process.env.NATS_URL ?? 'nats://localhost:4222');
let running = true;

/** Outbox relay: committed events -> JetStream, polled every 250ms. */
async function relayLoop() {
  while (running) {
    try {
      const n = await traced('outbox.relay', {}, () => relayOutbox(pool, bus));
      if (n) log.info({ published: n }, 'outbox relayed');
      if (n === 0) await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      log.error({ err }, 'outbox relay failed; retrying');
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
}

/** Projector: JetStream -> read models, with retry and dead-letter handling. */
async function projectLoop() {
  while (running) {
    try {
      await consumeProjectionBatch(pool, bus, {
        onOutcome: (o) =>
          o.outcome === 'applied' || o.outcome === 'duplicate'
            ? log.debug(o, 'projected')
            : log.warn(
                o,
                o.outcome === 'dead_letter'
                  ? 'event dead-lettered'
                  : 'projection failed; will redeliver',
              ),
      });
    } catch (err) {
      log.error({ err }, 'projector batch failed');
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
}

const shutdown = async () => {
  running = false;
  log.info('worker shutting down');
  await bus.close();
  await pool.end();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

log.info('worker started');
await Promise.all([relayLoop(), projectLoop()]);
