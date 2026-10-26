import type { DomainEvent } from '@shinrai/contracts';
import type { EventBus } from '@shinrai/domain';
import type { JetStreamBus } from './nats/bus';
import { inTransaction, type Pool } from './postgres/pool';
import { PROJECTOR, projectEvent, recordDeadLetter } from './postgres/projector';

/**
 * Publishes committed outbox events in id order, then stamps them published.
 * Only committed rows are visible here; a crash between publish and stamp re-publishes,
 * which JetStream dedupe (msgID) and idempotent consumers absorb.
 */
export async function relayOutbox(pool: Pool, bus: EventBus, limit = 100): Promise<number> {
  return inTransaction(pool, async (c) => {
    const rows = await c.query<{ id: number; event: DomainEvent }>(
      'SELECT id, event FROM outbox_events WHERE published_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED',
      [limit],
    );
    for (const r of rows.rows) await bus.publish(r.event);
    if (rows.rows.length) {
      await c.query('UPDATE outbox_events SET published_at = now() WHERE id = ANY($1::bigint[])', [
        rows.rows.map((r) => r.id),
      ]);
    }
    return rows.rows.length;
  });
}

export type ConsumerOptions = {
  maxDeliver?: number;
  /** Redelivery delay after a failure, by delivery count. */
  retryDelayMs?: (deliveryCount: number) => number;
  /** Test-only fault injection. */
  failWhen?: (event: unknown, deliveryCount: number) => boolean;
  onOutcome?: (o: {
    eventId: string | undefined;
    outcome: 'applied' | 'duplicate' | 'retry' | 'dead_letter';
    deliveryCount: number;
  }) => void;
};

/**
 * Pulls one batch for the projector. Failures are NAKed with backoff; after `maxDeliver`
 * attempts the message is recorded in `dead_letters`, copied to the DLQ stream and terminated.
 */
export async function consumeProjectionBatch(
  pool: Pool,
  bus: JetStreamBus,
  opts: ConsumerOptions = {},
): Promise<number> {
  const maxDeliver = opts.maxDeliver ?? 5;
  const consumer = await bus.ensureConsumer(PROJECTOR, maxDeliver);
  const msgs = await consumer.fetch({ max_messages: 50, expires: 1_000 });
  let handled = 0;
  for await (const m of msgs) {
    const raw = bus.decode(m.data);
    const eventId = (raw as { eventId?: string }).eventId;
    const n = m.info.deliveryCount;
    try {
      if (opts.failWhen?.(raw, n)) throw new Error(`injected projector failure (delivery ${n})`);
      const outcome = await projectEvent(pool, raw);
      m.ack();
      opts.onOutcome?.({ eventId, outcome, deliveryCount: n });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (n >= maxDeliver) {
        await recordDeadLetter(pool, PROJECTOR, eventId ?? `seq-${m.seq}`, n, message);
        await bus.publishDeadLetter(PROJECTOR, raw, message);
        m.term(message);
        opts.onOutcome?.({ eventId, outcome: 'dead_letter', deliveryCount: n });
      } else {
        m.nak(opts.retryDelayMs?.(n) ?? Math.min(5_000, 100 * 2 ** n));
        opts.onOutcome?.({ eventId, outcome: 'retry', deliveryCount: n });
      }
    }
    handled++;
  }
  return handled;
}
