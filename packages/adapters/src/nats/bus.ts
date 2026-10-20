import {
  AckPolicy,
  connect,
  DeliverPolicy,
  JSONCodec,
  nanos,
  StorageType,
  type JetStreamClient,
  type JetStreamManager,
  type NatsConnection,
} from 'nats';
import type { DomainEvent } from '@shinrai/contracts';
import type { EventBus } from '@shinrai/domain';

const codec = JSONCodec<unknown>();

/** JetStream EventBus. `msgID = eventId` lets the server drop duplicate publishes inside its window. */
export class JetStreamBus implements EventBus {
  readonly eventsStream: string;
  readonly dlqStream: string;

  private constructor(
    readonly nc: NatsConnection,
    readonly js: JetStreamClient,
    readonly jsm: JetStreamManager,
    /** Subject/stream namespace; isolated per test file, `shinrai` otherwise. */
    readonly namespace: string,
  ) {
    this.eventsStream = `${namespace.toUpperCase()}_EVENTS`;
    this.dlqStream = `${namespace.toUpperCase()}_DLQ`;
  }

  static async connect(servers: string, namespace = 'shinrai'): Promise<JetStreamBus> {
    const nc = await connect({ servers, name: namespace });
    const jsm = await nc.jetstreamManager();
    const bus = new JetStreamBus(nc, nc.jetstream(), jsm, namespace);
    await bus.ensureStream(bus.eventsStream, [`${namespace}.events.>`]);
    await bus.ensureStream(bus.dlqStream, [`${namespace}.dlq.>`]);
    return bus;
  }

  subject(e: Pick<DomainEvent, 'type'>) {
    return `${this.namespace}.events.${e.type}`;
  }

  private async ensureStream(name: string, subjects: string[]) {
    const config = {
      name,
      subjects,
      storage: StorageType.File,
      duplicate_window: nanos(2 * 60_000),
    };
    try {
      await this.jsm.streams.info(name);
    } catch {
      await this.jsm.streams.add(config);
    }
  }

  async publish(event: DomainEvent): Promise<void> {
    await this.js.publish(this.subject(event), codec.encode(event), { msgID: event.eventId });
  }

  async publishDeadLetter(consumer: string, payload: unknown, error: string): Promise<void> {
    await this.js.publish(`${this.namespace}.dlq.${consumer}`, codec.encode({ payload, error }));
  }

  /** Durable pull consumer with explicit acks and a bounded redelivery budget. */
  async ensureConsumer(durable: string, maxDeliver: number, ackWaitMs = 30_000) {
    try {
      await this.jsm.consumers.info(this.eventsStream, durable);
    } catch {
      await this.jsm.consumers.add(this.eventsStream, {
        durable_name: durable,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
        max_deliver: maxDeliver,
        ack_wait: nanos(ackWaitMs),
      });
    }
    return this.js.consumers.get(this.eventsStream, durable);
  }

  decode(data: Uint8Array): unknown {
    return codec.decode(data);
  }

  async close() {
    await this.nc.drain();
  }
}
