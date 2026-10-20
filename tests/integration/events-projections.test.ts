import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  consumeProjectionBatch,
  JetStreamBus,
  PostgresExchange,
  projectEvent,
  readPortfolio,
  rebuildProjections,
  relayOutbox,
  type ConsumerOptions,
  type Pool,
} from '@shinrai/adapters';
import { agent, cmd, MARKET_ID, marketDefinition, operator } from '../support/commands';
import { counts, freshDatabase } from '../support/pg';

let pool: Pool;
let ex: PostgresExchange;
const buses: JetStreamBus[] = [];

const newBus = async () => {
  const bus = await JetStreamBus.connect(inject('natsUrl'), `t${randomBytes(4).toString('hex')}`);
  buses.push(bus);
  return bus;
};

/** Pull until two consecutive empty batches (redeliveries are delayed a few ms). */
async function drain(bus: JetStreamBus, opts: ConsumerOptions = {}) {
  let empty = 0;
  while (empty < 2)
    empty = (await consumeProjectionBatch(pool, bus, { retryDelayMs: () => 20, ...opts }))
      ? 0
      : empty + 1;
}

const projections = async () => ({
  markets: (
    await pool.query(
      'SELECT tenant_id, market_id, view, applied_events FROM market_snapshots ORDER BY 1, 2',
    )
  ).rows,
  portfolios: (
    await pool.query(
      'SELECT tenant_id, owner_id, view, applied_events FROM portfolio_snapshots ORDER BY 1, 2',
    )
  ).rows,
  activity: (
    await pool.query(
      'SELECT event_id, outbox_id, type, status, summary FROM activity_feed ORDER BY outbox_id',
    )
  ).rows,
});

beforeAll(async () => {
  ({ pool } = await freshDatabase());
  ex = new PostgresExchange(pool);
  await ex.execute(cmd(operator, { type: 'OpenMarket', market: marketDefinition }));
  for (const o of ['alice', 'bob'])
    await ex.execute(cmd(operator, { type: 'GrantCredits', ownerId: o, amount: 10_000 }));
  await ex.execute(
    cmd(agent('bob'), {
      type: 'PlaceOrder',
      marketId: MARKET_ID,
      outcome: 'NO',
      price: 42,
      quantity: 30,
    }),
  );
  await ex.execute(
    cmd(agent('alice'), {
      type: 'PlaceOrder',
      marketId: MARKET_ID,
      outcome: 'YES',
      price: 58,
      quantity: 50,
    }),
  );
  await ex.execute(
    cmd(agent('alice'), {
      type: 'PlaceOrder',
      marketId: MARKET_ID,
      outcome: 'YES',
      price: 99,
      quantity: 9_999,
    }),
  );
});
afterAll(async () => {
  await Promise.all(buses.map((b) => b.close()));
  await pool?.end();
});

describe('outbox relay and projections over NATS JetStream', () => {
  it('publishes every committed event once and projects read models that match source facts', async () => {
    const bus = await newBus();
    const outbox = (await pool.query('SELECT count(*)::int AS n FROM outbox_events')).rows[0].n;
    expect(await relayOutbox(pool, bus)).toBe(outbox);
    expect(await relayOutbox(pool, bus)).toBe(0);

    await drain(bus);
    const p = await projections();
    expect(p.activity).toHaveLength(outbox);
    expect(p.activity.map((a) => a.status)).toContain('rejected');
    const alice = p.portfolios.find((r) => r.owner_id === 'alice');
    expect(alice?.view).toEqual(await readPortfolio(pool, 'demo', 'alice'));
  });

  it('a re-published event (crash before stamping) is deduplicated by JetStream msgID', async () => {
    const bus = await newBus();
    const { rows } = await pool.query('SELECT event FROM outbox_events ORDER BY id LIMIT 1');
    const event = rows[0].event;
    const first = await bus.js.publish(bus.subject(event), JSON.stringify(event), {
      msgID: event.eventId,
    });
    const again = await bus.js.publish(bus.subject(event), JSON.stringify(event), {
      msgID: event.eventId,
    });
    expect([first.duplicate, again.duplicate]).toEqual([false, true]);
    expect(again.seq).toBe(first.seq);
  });

  it('duplicate delivery to the consumer mutates projections once', async () => {
    const before = await projections();
    const { rows } = await pool.query(
      `SELECT event FROM outbox_events WHERE type = 'order.placed' ORDER BY id LIMIT 1`,
    );
    expect(await projectEvent(pool, rows[0].event)).toBe('duplicate');
    expect(await projections()).toEqual(before);
  });
});

describe('worker failure, retry and dead letter', () => {
  it('a failed projection is retried and lands exactly once', async () => {
    const bus = await newBus();
    await pool.query('UPDATE outbox_events SET published_at = now() WHERE published_at IS NULL'); // nothing pending
    await ex.execute(
      cmd(operator, { type: 'GrantCredits', ownerId: 'carol', amount: 500 }, 'retry-grant-01'),
    );
    const pending = (await pool.query('SELECT event FROM outbox_events WHERE published_at IS NULL'))
      .rows;
    expect(pending).toHaveLength(1);
    await relayOutbox(pool, bus);

    const outcomes: string[] = [];
    await drain(bus, {
      failWhen: (e, n) =>
        (e as { eventId: string }).eventId === pending[0].event.eventId && n === 1,
      onOutcome: (o) => o.eventId === pending[0].event.eventId && outcomes.push(o.outcome),
    });
    expect(outcomes).toEqual(['retry', 'applied']);
    const carol = await pool.query(
      `SELECT applied_events, view FROM portfolio_snapshots WHERE owner_id = 'carol'`,
    );
    expect(carol.rows[0].applied_events).toBe(1);
    expect(carol.rows[0].view.available).toBe(500);
  });

  it('a poison event is dead-lettered after max deliveries without touching source facts', async () => {
    const bus = await newBus();
    await ex.execute(
      cmd(operator, { type: 'GrantCredits', ownerId: 'dave', amount: 700 }, 'poison-grant-01'),
    );
    const poison = (await pool.query('SELECT event FROM outbox_events WHERE published_at IS NULL'))
      .rows[0].event;
    await relayOutbox(pool, bus);
    const facts = await counts(pool);

    const outcomes: string[] = [];
    await drain(bus, {
      maxDeliver: 3,
      failWhen: (e) => (e as { eventId: string }).eventId === poison.eventId,
      onOutcome: (o) => o.eventId === poison.eventId && outcomes.push(o.outcome),
    });
    expect(outcomes).toEqual(['retry', 'retry', 'dead_letter']);
    const dl = await pool.query(
      'SELECT consumer, attempts, error FROM dead_letters WHERE event_id = $1',
      [poison.eventId],
    );
    expect(dl.rows).toEqual([
      { consumer: 'projector', attempts: 3, error: 'injected projector failure (delivery 3)' },
    ]);
    expect(await counts(pool)).toEqual(facts);
  });
});

describe('projection rebuild', () => {
  it('deleting every read model and refolding the outbox reproduces them', async () => {
    await rebuildProjections(pool); // include the dead-lettered event's effect deterministically
    const before = await projections();
    await pool.query('TRUNCATE market_snapshots, portfolio_snapshots, activity_feed');
    expect((await projections()).activity).toHaveLength(0);
    await rebuildProjections(pool);
    expect(await projections()).toEqual(before);
  });
});
