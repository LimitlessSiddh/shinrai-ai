import pg from 'pg';

// int8 -> number (amounts are bounded by Number.MAX_SAFE_INTEGER in the contracts);
// timestamptz -> ISO string, matching the domain's timestamp format.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());

export type Pool = pg.Pool;
export type Client = pg.PoolClient;

export function createPool(connectionString: string, max = 10): Pool {
  return new pg.Pool({ connectionString, max });
}

/** Runs `fn` in a plain READ COMMITTED transaction (projections, agent records, admin writes). */
export async function inTransaction<T>(pool: Pool, fn: (c: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export const sqlState = (err: unknown): string | undefined =>
  typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : undefined;
