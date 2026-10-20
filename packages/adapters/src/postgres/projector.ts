import { DomainEvent } from '@shinrai/contracts';
import { inTransaction, type Client, type Pool } from './pool';
import { readMarketView, readPortfolio } from './queries';

export const PROJECTOR = 'projector';
/** Serializes live projection and full rebuild so they never interleave. */
const PROJECTION_LOCK = 4_242_100;

const credits = (cc: number) => (cc / 100).toFixed(2);

type Activity = { status: 'accepted' | 'rejected' | 'blocked' | 'info'; summary: string };

/** Deterministic, human-readable activity line for every event type. */
export function describeEvent(e: DomainEvent): Activity {
  switch (e.type) {
    case 'market.opened':
      return { status: 'info', summary: `Market opened: ${e.payload.market.question}` };
    case 'credits.granted':
      return {
        status: 'info',
        summary: `Granted ${credits(e.payload.amount)} paper credits to ${e.payload.ownerId}`,
      };
    case 'order.placed': {
      const o = e.payload.order;
      return {
        status: 'accepted',
        summary: `${o.ownerId} bought ${o.outcome} ${o.quantity} @ ${o.price}¢ — reserved ${credits(o.price * o.quantity)}, filled ${o.filledQuantity}`,
      };
    }
    case 'order.cancelled':
      return {
        status: 'accepted',
        summary: `Cancelled ${e.payload.orderId}; released ${credits(e.payload.released)} credits`,
      };
    case 'market.resolved': {
      const paid = e.payload.payouts.reduce((s, p) => s + p.amount, 0);
      return {
        status: 'accepted',
        summary: `Resolved ${e.payload.winningOutcome}; settled ${credits(paid)} credits to ${e.payload.payouts.length} holder(s)`,
      };
    }
    case 'command.rejected':
      return {
        status: 'rejected',
        summary: `${e.payload.commandType} rejected: ${e.payload.code} — ${e.payload.message}`,
      };
    case 'agent.tool.called':
      return {
        status: e.payload.policy === 'blocked' ? 'blocked' : e.payload.ok ? 'accepted' : 'rejected',
        summary: `Agent ${e.actor.actorId} called ${e.payload.tool}${e.payload.policy === 'not_applicable' ? '' : ` — policy ${e.payload.policy}`}${e.payload.reasons.length ? `: ${e.payload.reasons.join('; ')}` : ''}`,
      };
    case 'agent.run.completed':
      return {
        status: 'info',
        summary: `Agent run ${e.payload.runId} ${e.payload.status}${e.payload.probabilityYes === null ? '' : ` — P(YES) ${e.payload.probabilityYes}`}`,
      };
  }
}

async function marketOf(c: Client, e: DomainEvent): Promise<string | null> {
  switch (e.type) {
    case 'market.opened':
      return e.payload.market.marketId;
    case 'order.placed':
    case 'order.cancelled':
    case 'market.resolved':
      return e.aggregateId;
    case 'command.rejected': {
      const r = await c.query('SELECT 1 FROM markets WHERE tenant_id = $1 AND market_id = $2', [
        e.tenantId,
        e.aggregateId,
      ]);
      return r.rowCount ? e.aggregateId : null;
    }
    default:
      return null;
  }
}

async function ownersOf(c: Client, e: DomainEvent): Promise<string[]> {
  switch (e.type) {
    case 'credits.granted':
      return [e.payload.ownerId];
    case 'order.placed':
      return [
        e.payload.order.ownerId,
        ...e.payload.fills.flatMap((f) => [f.yesOwnerId, f.noOwnerId]),
      ];
    case 'order.cancelled':
      return [e.actor.actorId];
    case 'market.resolved': {
      const r = await c.query<{ owner_id: string }>(
        `SELECT DISTINCT owner_id FROM positions WHERE tenant_id = $1 AND market_id = $2
         UNION SELECT DISTINCT owner_id FROM orders WHERE tenant_id = $1 AND market_id = $2`,
        [e.tenantId, e.payload.marketId],
      );
      return r.rows.map((x) => x.owner_id);
    }
    default:
      return [];
  }
}

/** Applies one event to the read models. Snapshots are recomputed from source facts, so order cannot corrupt them. */
async function applyEvent(c: Client, e: DomainEvent, outboxId: number): Promise<void> {
  const a = describeEvent(e);
  await c.query(`INSERT INTO activity_feed VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
    e.tenantId,
    e.eventId,
    outboxId,
    e.type,
    e.correlationId,
    e.actor.actorId,
    a.status,
    a.summary,
    e.occurredAt,
  ]);
  const marketId = await marketOf(c, e);
  if (marketId) {
    const view = await readMarketView(c, e.tenantId, marketId);
    if (view) {
      await c.query(
        `INSERT INTO market_snapshots (tenant_id, market_id, view, applied_events, last_event_id) VALUES ($1, $2, $3, 1, $4)
         ON CONFLICT (tenant_id, market_id) DO UPDATE SET view = EXCLUDED.view, last_event_id = EXCLUDED.last_event_id,
           applied_events = market_snapshots.applied_events + 1, updated_at = now()`,
        [e.tenantId, marketId, view, e.eventId],
      );
    }
  }
  for (const owner of [...new Set(await ownersOf(c, e))].sort()) {
    await c.query(
      `INSERT INTO portfolio_snapshots (tenant_id, owner_id, view, applied_events, last_event_id) VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (tenant_id, owner_id) DO UPDATE SET view = EXCLUDED.view, last_event_id = EXCLUDED.last_event_id,
         applied_events = portfolio_snapshots.applied_events + 1, updated_at = now()`,
      [e.tenantId, owner, await readPortfolio(c, e.tenantId, owner), e.eventId],
    );
  }
}

/**
 * Idempotent consumer step: records (consumer, event) and applies the projection in one transaction.
 * A duplicate delivery finds the record and changes nothing.
 */
export async function projectEvent(pool: Pool, raw: unknown): Promise<'applied' | 'duplicate'> {
  const e = DomainEvent.parse(raw);
  return inTransaction(pool, async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [PROJECTION_LOCK]);
    const ins = await c.query(
      'INSERT INTO event_deliveries (consumer, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [PROJECTOR, e.eventId],
    );
    if (ins.rowCount === 0) return 'duplicate';
    const o = await c.query<{ id: number }>('SELECT id FROM outbox_events WHERE event_id = $1', [
      e.eventId,
    ]);
    const outboxId = o.rows[0]?.id;
    if (outboxId === undefined)
      throw new Error(`event ${e.eventId} is not a committed outbox event`);
    await applyEvent(c, e, outboxId);
    return 'applied';
  });
}

/** Deletes every read model and refolds all committed outbox events in order. */
export async function rebuildProjections(pool: Pool): Promise<number> {
  return inTransaction(pool, async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [PROJECTION_LOCK]);
    await c.query('TRUNCATE market_snapshots, portfolio_snapshots, activity_feed');
    await c.query('DELETE FROM event_deliveries WHERE consumer = $1', [PROJECTOR]);
    const events = await c.query<{ id: number; event: DomainEvent }>(
      'SELECT id, event FROM outbox_events ORDER BY id',
    );
    for (const row of events.rows) {
      await c.query('INSERT INTO event_deliveries (consumer, event_id) VALUES ($1, $2)', [
        PROJECTOR,
        row.event.eventId,
      ]);
      await applyEvent(c, DomainEvent.parse(row.event), row.id);
    }
    return events.rows.length;
  });
}

export async function recordDeadLetter(
  pool: Pool,
  consumer: string,
  eventId: string,
  attempts: number,
  error: string,
) {
  await pool.query(
    `INSERT INTO dead_letters (consumer, event_id, attempts, error) VALUES ($1, $2, $3, $4)
     ON CONFLICT (consumer, event_id) DO UPDATE SET attempts = EXCLUDED.attempts, error = EXCLUDED.error`,
    [consumer, eventId, attempts, error.slice(0, 2000)],
  );
}
