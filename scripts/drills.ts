/**
 * Scripted failure drills against the local stack (PostgreSQL + NATS from `pnpm stack:up`).
 * Runs in an isolated scratch database and NATS namespace, so demo data is never touched.
 */
import {
  consumeProjectionBatch,
  createPool,
  JetStreamBus,
  loadFixture,
  migrate,
  PgRunRecorder,
  PostgresExchange,
  projectEvent,
  readPortfolio,
  rebuildProjections,
  registerFixture,
  relayOutbox,
  type Pool,
} from '@shinrai/adapters';
import { fixtureEvidence, runScenario, seedFixture } from '@shinrai/agent-tools';
import { canonicalJson, counterIds, steppingClock } from '@shinrai/domain';

const base = new URL(
  process.env.DATABASE_URL ?? 'postgres://shinrai:shinrai_local@localhost:55432/shinrai',
);
const DRILL_DB = 'shinrai_drills';
const results: { drill: string; ok: boolean; detail: string }[] = [];

async function drill(name: string, fn: () => Promise<string>) {
  try {
    results.push({ drill: name, ok: true, detail: await fn() });
  } catch (e) {
    results.push({ drill: name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const factCounts = async (pool: Pool) =>
  (
    await pool.query(
      `SELECT (SELECT count(*) FROM orders) o, (SELECT count(*) FROM ledger_entries) l, (SELECT count(*) FROM credit_reservations) r`,
    )
  ).rows[0];

// Fresh scratch database for this drill run (our own throwaway database only).
const admin = createPool(base.toString(), 1);
await admin.query(`DROP DATABASE IF EXISTS ${DRILL_DB} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${DRILL_DB}`);
await admin.end();
const url = new URL(base);
url.pathname = `/${DRILL_DB}`;
const pool = createPool(url.toString(), 20);
await migrate(pool);
const bus = await JetStreamBus.connect(
  process.env.NATS_URL ?? 'nats://localhost:4222',
  `drill${Date.now()}`,
);

const fixture = await loadFixture();
const ids = counterIds('drill.');
const clock = steppingClock(fixture.manifest.replayStartsAt);
const exchange = new PostgresExchange(pool, { ids, clock });
const ctx = {
  fixture,
  tenantId: 'drill',
  exchange,
  recorder: new PgRunRecorder(pool),
  evidence: fixtureEvidence(fixture),
  ids,
  clock,
  keyPrefix: 'drill',
};
await registerFixture(pool, 'drill', fixture);
await seedFixture(ctx);
const marketId = fixture.manifest.market.marketId;
const order = (key: string, quantity: number) => ({
  meta: {
    idempotencyKey: key,
    correlationId: `corr-${key}`,
    causationId: 'drill',
    actor: { tenantId: 'drill', actorId: 'operator', kind: 'human' as const },
    issuedAt: clock.now(),
  },
  payload: { type: 'PlaceOrder' as const, marketId, outcome: 'YES' as const, price: 60, quantity },
});

await drill('duplicate request', async () => {
  const a = await exchange.execute(order('drill-dup-0001', 5));
  const b = await exchange.execute(order('drill-dup-0001', 5));
  assert(
    a.status === 'accepted' &&
      b.replayed &&
      canonicalJson({ ...b, replayed: false }) === canonicalJson(a),
    'duplicate did not replay the original',
  );
  const n = (
    await pool.query(
      `SELECT count(*)::int n FROM orders WHERE correlation_id = 'corr-drill-dup-0001'`,
    )
  ).rows[0].n;
  assert(n === 1, `expected 1 order, found ${n}`);
  return 'second request returned the stored result; one order, one reservation';
});

await drill('insufficient credits', async () => {
  const before = await factCounts(pool);
  const r = await exchange.execute(order('drill-broke-0001', 1_000_000));
  assert(
    r.status === 'rejected' && r.code === 'INSUFFICIENT_CREDITS',
    'expected INSUFFICIENT_CREDITS',
  );
  assert(
    JSON.stringify(await factCounts(pool)) === JSON.stringify(before),
    'facts changed on rejection',
  );
  return 'rejected with zero order/reservation/ledger mutation';
});

await drill('policy-blocked agent action', async () => {
  const before = await factCounts(pool);
  const s = fixture.scenarios.find((x) => x.scenarioId === 'reckless-oversize');
  assert(s, 'scenario missing');
  const { run } = await runScenario(ctx, s);
  const blocked = (
    await pool.query(
      `SELECT reasons FROM agent_tool_calls WHERE run_id = $1 AND tool = 'requestOrder'`,
      [run.runId],
    )
  ).rows[0];
  assert(blocked, 'no requestOrder call recorded');
  assert(
    JSON.stringify(await factCounts(pool)) === JSON.stringify(before),
    'blocked agent changed facts',
  );
  return `blocked: ${blocked.reasons.map((r: { code: string }) => r.code).join(', ')}`;
});

await relayOutbox(pool, bus, 1000);
await drill('worker failure and retry', async () => {
  const outcomes: string[] = [];
  let target: string | undefined;
  for (let empty = 0; empty < 2;) {
    const n = await consumeProjectionBatch(pool, bus, {
      retryDelayMs: () => 20,
      failWhen: (e, d) => {
        target ??= (e as { eventId: string }).eventId;
        return (e as { eventId: string }).eventId === target && d === 1;
      },
      onOutcome: (o) => o.eventId === target && outcomes.push(o.outcome),
    });
    empty = n ? 0 : empty + 1;
  }
  assert(outcomes.join(',') === 'retry,applied', `unexpected outcomes ${outcomes.join(',')}`);
  return 'first delivery failed and was NAKed; redelivery applied it once';
});

await drill('duplicate event delivery', async () => {
  const { rows } = await pool.query(
    `SELECT event FROM outbox_events WHERE type = 'order.placed' ORDER BY id LIMIT 1`,
  );
  const before = (await pool.query(`SELECT sum(applied_events)::int n FROM portfolio_snapshots`))
    .rows[0].n;
  const outcome = await projectEvent(pool, rows[0].event);
  const after = (await pool.query(`SELECT sum(applied_events)::int n FROM portfolio_snapshots`))
    .rows[0].n;
  assert(outcome === 'duplicate' && before === after, 'duplicate delivery changed projections');
  return 'redelivered event recognised as duplicate; projections unchanged';
});

await drill('projection rebuild', async () => {
  const snapshot = async () =>
    JSON.stringify(
      (await pool.query(`SELECT owner_id, view FROM portfolio_snapshots ORDER BY owner_id`)).rows,
    );
  const before = await snapshot();
  await pool.query('TRUNCATE market_snapshots, portfolio_snapshots, activity_feed');
  const n = await rebuildProjections(pool);
  assert((await snapshot()) === before, 'rebuilt projections differ');
  const research = await readPortfolio(pool, 'drill', 'agent-research');
  return `refolded ${n} events; agent-research available ${research.available / 100} credits matches source`;
});

await bus.close();
await pool.end();
console.table(
  results.map((r) => ({ drill: r.drill, result: r.ok ? 'PASS' : 'FAIL', detail: r.detail })),
);
process.exit(results.every((r) => r.ok) ? 0 : 1);
