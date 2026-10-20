/**
 * E2E backend: recreates the throwaway `shinrai_e2e` database on the local stack, then runs the
 * API and worker against it on port 4100. Never touches the developer's demo database.
 */
import { spawn } from 'node:child_process';
import { createPool, migrate } from '@shinrai/adapters';

const base = new URL(
  process.env.DATABASE_URL ?? 'postgres://shinrai:shinrai_local@localhost:55432/shinrai',
);
const admin = createPool(base.toString(), 1);
await admin.query('DROP DATABASE IF EXISTS shinrai_e2e WITH (FORCE)');
await admin.query('CREATE DATABASE shinrai_e2e');
await admin.end();
base.pathname = '/shinrai_e2e';
const pool = createPool(base.toString(), 1);
await migrate(pool);
await pool.end();

const env = {
  ...process.env,
  DATABASE_URL: base.toString(),
  API_PORT: '4100',
  WEB_ORIGIN: 'http://localhost:3100',
  LOG_LEVEL: 'warn',
  SHINRAI_MODEL: 'fake',
};
for (const entry of ['apps/api/src/main.ts', 'apps/worker/src/main.ts']) {
  const child = spawn(process.execPath, ['--import', 'tsx', entry], { env, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 1));
}
