/** AWS demo profile: scheduled outbox relay -> EventBridge. Runs only while the demo stack exists. */
import { createPool, EventBridgeBus, relayOutbox } from '@shinrai/adapters';

const pool = createPool(process.env.DATABASE_URL ?? '', 2);
const bus = new EventBridgeBus(process.env.EVENT_BUS_NAME ?? 'shinrai-events');

export async function handler(): Promise<{ published: number }> {
  return { published: await relayOutbox(pool, bus) };
}
