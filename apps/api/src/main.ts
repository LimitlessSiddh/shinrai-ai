import { createPool, migrate } from '@shinrai/adapters';
import { startTracing } from '@shinrai/observability';
import { buildApp } from './app';
import { loadConfig } from './config';

startTracing('shinrai-api');
const config = loadConfig();
const pool = createPool(config.databaseUrl);
await migrate(pool);
const app = await buildApp(config, pool);
await app.listen({ port: config.port, host: '127.0.0.1' });

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
