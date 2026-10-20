import { randomUUID } from 'node:crypto';
import type { Command, CommandResult, DomainEvent } from '@shinrai/contracts';
import {
  executeCommand,
  systemClock,
  type Clock,
  type Exchange,
  type IdSource,
  type MarketView,
  type PolicyRecord,
  type PortfolioView,
} from '@shinrai/domain';
import { sqlState, type Pool } from './pool';
import { readMarketView, readPortfolio } from './queries';
import { MarketBusy, PgCommandStore } from './store';

/** serialization_failure, deadlock_detected, unique_violation (two racers inserting one idempotency key). */
const RETRYABLE = new Set(['40001', '40P01', '23505']);

export const uuidIds: IdSource = { next: (kind) => `${kind}_${randomUUID()}` };

export type PostgresExchangeOptions = {
  ids?: IdSource;
  clock?: Clock;
  maxAttempts?: number;
  /** Total time to wait for a busy market lock before giving up. */
  lockWaitMs?: number;
  /** Backoff before attempt n (n >= 2). Injected so tests and replays stay deterministic. */
  backoffMs?: (attempt: number) => number;
  /** Test-only fault injection, called just before COMMIT. */
  beforeCommit?: (attempt: number, command: Command) => void | Promise<void>;
  onRetry?: (info: { attempt: number; code: string | undefined; correlationId: string }) => void;
};

export class TransactionRetriesExhausted extends Error {
  constructor(
    readonly attempts: number,
    cause: unknown,
  ) {
    super(`command failed after ${attempts} serializable attempts`, { cause });
  }
}

export class PostgresExchange implements Exchange {
  private readonly ids: IdSource;
  private readonly clock: Clock;
  private readonly maxAttempts: number;
  private readonly backoffMs: (attempt: number) => number;
  private readonly lockWaitMs: number;

  constructor(
    private readonly pool: Pool,
    private readonly options: PostgresExchangeOptions = {},
  ) {
    this.ids = options.ids ?? uuidIds;
    this.clock = options.clock ?? systemClock;
    this.maxAttempts = options.maxAttempts ?? 8;
    // ponytail: full-jitter exponential backoff capped at 200ms; tune if contention grows.
    this.backoffMs = options.backoffMs ?? ((n) => Math.random() * Math.min(200, 5 * 2 ** n));
    this.lockWaitMs = options.lockWaitMs ?? 10_000;
  }

  /** One SERIALIZABLE transaction per attempt; retried on serialization failures with backoff. */
  async execute(command: Command, policy?: PolicyRecord): Promise<CommandResult> {
    const lockDeadline = Date.now() + this.lockWaitMs;
    for (let attempt = 1; ;) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const result = await executeCommand(command, {
          store: new PgCommandStore(client),
          ids: this.ids,
          clock: this.clock,
          ...(policy ? { policy } : {}),
        });
        await this.options.beforeCommit?.(attempt, command);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (err instanceof MarketBusy) {
          // Waiting for the market lock is queueing, not a conflict: it does not use an attempt.
          if (Date.now() > lockDeadline) throw err;
          await new Promise((r) => setTimeout(r, 1 + Math.random() * 4));
          continue;
        }
        const code = sqlState(err);
        if (!RETRYABLE.has(code ?? '')) throw err;
        if (attempt >= this.maxAttempts) throw new TransactionRetriesExhausted(attempt, err);
        this.options.onRetry?.({ attempt, code, correlationId: command.meta.correlationId });
        attempt += 1;
        await new Promise((r) => setTimeout(r, this.backoffMs(attempt)));
      } finally {
        client.release();
      }
    }
  }

  getMarket(tenantId: string, marketId: string): Promise<MarketView | null> {
    return readMarketView(this.pool, tenantId, marketId);
  }

  getPortfolio(tenantId: string, ownerId: string): Promise<PortfolioView> {
    return readPortfolio(this.pool, tenantId, ownerId);
  }

  async events(tenantId: string): Promise<DomainEvent[]> {
    const r = await this.pool.query<{ event: DomainEvent }>(
      'SELECT event FROM outbox_events WHERE tenant_id = $1 ORDER BY id',
      [tenantId],
    );
    return r.rows.map((x) => x.event);
  }
}
