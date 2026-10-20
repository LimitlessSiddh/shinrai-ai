/** AWS demo profile: SQS (fed by an EventBridge rule) -> projector. Failed records are retried, then DLQ'd by SQS. */
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { createPool, projectEvent } from '@shinrai/adapters';

const pool = createPool(process.env.DATABASE_URL ?? '', 2);

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) {
    try {
      const envelope = JSON.parse(record.body) as { detail: unknown };
      await projectEvent(pool, envelope.detail);
    } catch {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}
