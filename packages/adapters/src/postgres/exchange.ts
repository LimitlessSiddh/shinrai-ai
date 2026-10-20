import { randomUUID } from 'node:crypto';
import type { Command, CommandResult, DomainEvent, Fill } from '@shinrai/contracts';
import {
  availableAccount,
  executeCommand,
  marketView,
  reservedAccount,
  systemClock,
  type Clock,
  type Exchange,
  type IdSource,
  type MarketView,
  type PolicyRecord,
  type PortfolioView,
} from '@shinrai/domain';
import { sqlState, type Pool } from './pool';
import { ORDER_COLUMNS, ORDER_FROM, toMarket, toOrder, toPosition } from './rows';
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

  async getMarket(tenantId: string, marketId: string): Promise<MarketView | null> {
    const m = await this.pool.query(
      'SELECT tenant_id, definition, status, winning_outcome, next_sequence, opened_at FROM markets WHERE tenant_id = $1 AND market_id = $2',
      [tenantId, marketId],
    );
    if (!m.rows[0]) return null;
    const open = await this.pool.query(
      `SELECT ${ORDER_COLUMNS} FROM ${ORDER_FROM} WHERE o.tenant_id = $1 AND o.market_id = $2 AND o.status = 'open'`,
      [tenantId, marketId],
    );
    const fills = await this.pool.query<{ quantity: number; yes_price: number; sequence: number }>(
      'SELECT quantity, yes_price, sequence FROM fills WHERE tenant_id = $1 AND market_id = $2 ORDER BY sequence',
      [tenantId, marketId],
    );
    return marketView(
      toMarket(m.rows[0]),
      open.rows.map(toOrder),
      fills.rows.map(
        (f) => ({ quantity: f.quantity, yesPrice: f.yes_price, sequence: f.sequence }) as Fill,
      ),
    );
  }

  async getPortfolio(tenantId: string, ownerId: string): Promise<PortfolioView> {
    const balances = await this.pool.query<{ account_id: string; balance: number }>(
      'SELECT account_id, balance FROM ledger_accounts WHERE tenant_id = $1 AND account_id = ANY($2::text[])',
      [tenantId, [availableAccount(ownerId), reservedAccount(ownerId)]],
    );
    const bal = (id: string) => balances.rows.find((r) => r.account_id === id)?.balance ?? 0;
    const positions = await this.pool.query(
      'SELECT owner_id, market_id, outcome, quantity, cost FROM positions WHERE tenant_id = $1 AND owner_id = $2 ORDER BY market_id, outcome',
      [tenantId, ownerId],
    );
    const open = await this.pool.query(
      `SELECT ${ORDER_COLUMNS} FROM ${ORDER_FROM} WHERE o.tenant_id = $1 AND o.owner_id = $2 AND o.status = 'open' ORDER BY o.sequence`,
      [tenantId, ownerId],
    );
    return {
      ownerId,
      available: bal(availableAccount(ownerId)),
      reserved: bal(reservedAccount(ownerId)),
      positions: positions.rows.map(toPosition),
      openOrders: open.rows.map(toOrder),
    };
  }

  async events(tenantId: string): Promise<DomainEvent[]> {
    const r = await this.pool.query<{ event: DomainEvent }>(
      'SELECT event FROM outbox_events WHERE tenant_id = $1 ORDER BY id',
      [tenantId],
    );
    return r.rows.map((x) => x.event);
  }
}
