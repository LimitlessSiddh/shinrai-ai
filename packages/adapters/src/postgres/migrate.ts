import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { inTransaction, type Pool } from './pool';

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));
const MIGRATION_LOCK = 4_242_001;

/** Applies pending numbered `*.sql` files once, in order, in one transaction. Safe to run concurrently. */
export async function migrate(pool: Pool): Promise<string[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  return inTransaction(pool, async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    await c.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set(
      (await c.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map(
        (r) => r.version,
      ),
    );
    const applied: string[] = [];
    for (const file of files) {
      if (done.has(file)) continue;
      await c.query(await readFile(MIGRATIONS_DIR + file, 'utf8'));
      await c.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      applied.push(file);
    }
    return applied;
  });
}
