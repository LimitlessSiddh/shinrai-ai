import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

/** One PostgreSQL and one NATS JetStream container per test run; each test file gets its own database. */
export default async function setup(project: TestProject) {
  const [pg, nats] = await Promise.all([
    new PostgreSqlContainer('postgres:17.6-alpine').start(),
    new GenericContainer('nats:2.11.9-alpine')
      .withCommand(['-js'])
      .withExposedPorts(4222)
      .withWaitStrategy(Wait.forLogMessage(/Server is ready/))
      .start(),
  ]);
  project.provide('pgAdminUrl', pg.getConnectionUri());
  project.provide('natsUrl', `nats://${nats.getHost()}:${nats.getMappedPort(4222)}`);
  return async () => {
    await Promise.all([nats.stop(), pg.stop()]);
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
    natsUrl: string;
  }
}
