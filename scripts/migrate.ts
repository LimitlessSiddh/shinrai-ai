import { createPool, migrate } from '@shinrai/adapters';

const pool = createPool(
  process.env.DATABASE_URL ?? 'postgres://shinrai:shinrai_local@localhost:55432/shinrai',
);
const applied = await migrate(pool);
console.log(applied.length ? `applied: ${applied.join(', ')}` : 'database is up to date');
await pool.end();
