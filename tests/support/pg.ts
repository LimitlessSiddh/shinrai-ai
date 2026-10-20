import { randomBytes } from 'node:crypto';
import { inject } from 'vitest';
import { createPool, migrate, type Pool } from '@shinrai/adapters';

/** Creates and migrates an isolated database on the shared test container. */
export async function freshDatabase(): Promise<{ pool: Pool; url: string }> {
  const admin = inject('pgAdminUrl');
  const name = `t_${randomBytes(6).toString('hex')}`;
  const adminPool = createPool(admin, 1);
  await adminPool.query(`CREATE DATABASE ${name}`);
  await adminPool.end();
  const url = new URL(admin);
  url.pathname = `/${name}`;
  const pool = createPool(url.toString(), 30);
  await migrate(pool);
  return { pool, url: url.toString() };
}

const COUNTED = [
  'orders',
  'fills',
  'positions',
  'credit_reservations',
  'ledger_transactions',
  'ledger_entries',
  'market_resolutions',
  'outbox_events',
  'audit_log',
  'idempotency_keys',
] as const;

/** Row counts of every fact table, for "nothing changed" assertions. */
export async function counts(pool: Pool): Promise<Record<(typeof COUNTED)[number], number>> {
  const out = {} as Record<(typeof COUNTED)[number], number>;
  for (const t of COUNTED) {
    out[t] = Number((await pool.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);
  }
  return out;
}

/** Ledger invariants straight from SQL: every tx balances; stored balances equal the entries. */
export async function assertLedgerInvariants(pool: Pool) {
  const unbalanced = await pool.query(
    `SELECT tx_id FROM ledger_entries GROUP BY tenant_id, tx_id
     HAVING sum(CASE direction WHEN 'credit' THEN amount ELSE -amount END) <> 0`,
  );
  const drift = await pool.query(
    `SELECT a.account_id FROM ledger_accounts a
     LEFT JOIN ledger_entries e USING (tenant_id, account_id)
     GROUP BY a.tenant_id, a.account_id, a.balance
     HAVING a.balance <> coalesce(sum(CASE e.direction WHEN 'credit' THEN e.amount ELSE -e.amount END), 0)`,
  );
  const negative = await pool.query(
    `SELECT account_id FROM ledger_accounts WHERE kind <> 'issuance' AND balance < 0`,
  );
  const reservedDrift = await pool.query(
    `SELECT a.account_id FROM ledger_accounts a
     WHERE a.kind = 'reserved' AND a.balance <> coalesce((
       SELECT sum(r.remaining_amount) FROM credit_reservations r JOIN orders o USING (tenant_id, order_id)
       WHERE r.tenant_id = a.tenant_id AND a.account_id = 'agent:' || o.owner_id || ':reserved' AND o.status = 'open'), 0)`,
  );
  return {
    unbalanced: unbalanced.rows.map((r) => r.tx_id),
    drift: drift.rows.map((r) => r.account_id),
    negative: negative.rows.map((r) => r.account_id),
    reservedDrift: reservedDrift.rows.map((r) => r.account_id),
  };
}
