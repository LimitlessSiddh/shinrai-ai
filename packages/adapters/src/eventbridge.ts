import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { DomainEvent } from '@shinrai/contracts';
import type { EventBus } from '@shinrai/domain';

/** AWS demo-profile EventBus: same port as JetStream. Consumers dedupe by eventId (event_deliveries). */
export class EventBridgeBus implements EventBus {
  private readonly client = new EventBridgeClient({});
  constructor(private readonly busName: string) {}

  async publish(event: DomainEvent): Promise<void> {
    const r = await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.busName,
            Source: 'shinrai',
            DetailType: event.type,
            Detail: JSON.stringify(event),
          },
        ],
      }),
    );
    if (r.FailedEntryCount)
      throw new Error(`EventBridge rejected ${event.eventId}: ${r.Entries?.[0]?.ErrorMessage}`);
  }
}
