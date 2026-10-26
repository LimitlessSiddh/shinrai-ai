import type { Command, CommandResult, DomainEvent, Market } from '@shinrai/contracts';
import {
  availableAccount,
  escrowAccount,
  reservedAccount,
  type CommandStore,
  type CommitInput,
} from '@shinrai/domain';
import type { Client } from './pool';
import { accountKind, ORDER_COLUMNS, ORDER_FROM, toMarket, toOrder, toPosition } from './rows';

/** The market's transaction-scoped advisory lock is held by another command. */
export class MarketBusy extends Error {
  readonly code = 'SHINRAI_MARKET_BUSY';
  constructor(marketId: string) {
    super(`market ${marketId} is locked by another command`);
  }
}

/**
 * CommandStore bound to one SERIALIZABLE transaction. `prepare` takes the locks:
 * a transaction-scoped advisory lock per market, then every account the command can touch,
 * in stable account-id order.
 */
export class PgCommandStore implements CommandStore {
  constructor(private readonly c: Client) {}

  async prepare(command: Command): Promise<void> {
    const tenantId = command.meta.actor.tenantId;
    const p = command.payload;
    let marketId: string | null = null;
    if (p.type === 'OpenMarket') marketId = p.market.marketId;
    else if (p.type === 'PlaceOrder' || p.type === 'ResolveMarket') marketId = p.marketId;
    else if (p.type === 'CancelOrder') {
      const r = await this.c.query<{ market_id: string }>(
        'SELECT market_id FROM orders WHERE tenant_id = $1 AND order_id = $2',
        [tenantId, p.orderId],
      );
      marketId = r.rows[0]?.market_id ?? null;
    }

    const owners = new Set<string>([command.meta.actor.actorId]);
    if (p.type === 'GrantCredits') owners.add(p.ownerId);
    const accounts: string[] = [];
    if (marketId) {
      // Try-lock, never block: a SERIALIZABLE snapshot is fixed when a statement starts, so blocking
      // here would leave us holding the lock on a stale snapshot. The exchange retries on MarketBusy.
      const lock = await this.c.query<{ ok: boolean }>(
        'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS ok',
        [`${tenantId}:${marketId}`],
      );
      if (!lock.rows[0]?.ok) throw new MarketBusy(marketId);
      accounts.push(escrowAccount(marketId));
      const book = await this.c.query<{ owner_id: string }>(
        `SELECT DISTINCT owner_id FROM orders WHERE tenant_id = $1 AND market_id = $2 AND status = 'open'`,
        [tenantId, marketId],
      );
      for (const r of book.rows) owners.add(r.owner_id);
      if (p.type === 'ResolveMarket') {
        const holders = await this.c.query<{ owner_id: string }>(
          'SELECT DISTINCT owner_id FROM positions WHERE tenant_id = $1 AND market_id = $2',
          [tenantId, marketId],
        );
        for (const r of holders.rows) owners.add(r.owner_id);
      }
    }
    for (const o of owners) accounts.push(availableAccount(o), reservedAccount(o));
    // Stable lock order prevents deadlocks between commands that touch overlapping accounts.
    await this.c.query(
      `SELECT account_id FROM ledger_accounts WHERE tenant_id = $1 AND account_id = ANY($2::text[])
       ORDER BY account_id FOR UPDATE`,
      [tenantId, [...new Set(accounts)].sort()],
    );
  }

  async findIdempotent(scope: string) {
    const r = await this.c.query<{ request_fingerprint: string; result: CommandResult }>(
      'SELECT request_fingerprint, result FROM idempotency_keys WHERE scope = $1',
      [scope],
    );
    const row = r.rows[0];
    return row ? { requestFingerprint: row.request_fingerprint, result: row.result } : null;
  }

  async market(tenantId: string, marketId: string): Promise<Market | null> {
    const r = await this.c.query(
      'SELECT tenant_id, definition, status, winning_outcome, next_sequence, opened_at FROM markets WHERE tenant_id = $1 AND market_id = $2',
      [tenantId, marketId],
    );
    return r.rows[0] ? toMarket(r.rows[0]) : null;
  }

  async balance(tenantId: string, accountId: string): Promise<number> {
    const r = await this.c.query<{ balance: number }>(
      'SELECT balance FROM ledger_accounts WHERE tenant_id = $1 AND account_id = $2',
      [tenantId, accountId],
    );
    return r.rows[0]?.balance ?? 0;
  }

  async openOrders(tenantId: string, marketId: string) {
    const r = await this.c.query(
      `SELECT ${ORDER_COLUMNS} FROM ${ORDER_FROM}
       WHERE o.tenant_id = $1 AND o.market_id = $2 AND o.status = 'open' ORDER BY o.sequence`,
      [tenantId, marketId],
    );
    return r.rows.map(toOrder);
  }

  async order(tenantId: string, orderId: string) {
    const r = await this.c.query(
      `SELECT ${ORDER_COLUMNS} FROM ${ORDER_FROM} WHERE o.tenant_id = $1 AND o.order_id = $2`,
      [tenantId, orderId],
    );
    return r.rows[0] ? toOrder(r.rows[0]) : null;
  }

  async positions(tenantId: string, marketId: string) {
    const r = await this.c.query(
      'SELECT owner_id, market_id, outcome, quantity, cost FROM positions WHERE tenant_id = $1 AND market_id = $2 ORDER BY owner_id, outcome',
      [tenantId, marketId],
    );
    return r.rows.map(toPosition);
  }

  async resolutionEvent(tenantId: string, marketId: string): Promise<DomainEvent | null> {
    const r = await this.c.query<{ event: DomainEvent }>(
      `SELECT o.event FROM market_resolutions m JOIN outbox_events o USING (event_id)
       WHERE m.tenant_id = $1 AND m.market_id = $2`,
      [tenantId, marketId],
    );
    return r.rows[0]?.event ?? null;
  }

  /** Writes every fact of the command, its single outbox event, audit row and idempotency record. */
  async commit(input: CommitInput): Promise<void> {
    const { command, decision, event, result } = input;
    const tenantId = command.meta.actor.tenantId;
    const { correlationId } = command.meta;
    const eventId = event?.eventId ?? null;
    const q = (sql: string, params: unknown[]) => this.c.query(sql, params);

    if (decision && event) {
      const m = decision.market;
      if (m && event.type === 'market.opened') {
        const {
          tenantId: _t,
          status: _s,
          winningOutcome: _w,
          nextSequence: _n,
          openedAt: _o,
          ...definition
        } = m;
        await q(
          `INSERT INTO markets (tenant_id, market_id, fixture_version, definition, status, winning_outcome, next_sequence, opened_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            tenantId,
            m.marketId,
            m.fixtureVersion,
            definition,
            m.status,
            m.winningOutcome,
            m.nextSequence,
            m.openedAt,
          ],
        );
        await q(`INSERT INTO outcomes VALUES ($1, $2, 'YES', $3), ($1, $2, 'NO', $4)`, [
          tenantId,
          m.marketId,
          m.yesMeans,
          `Not: ${m.yesMeans}`,
        ]);
        for (const [i, rule] of m.rules.entries()) {
          await q('INSERT INTO market_rules VALUES ($1, $2, $3, $4)', [
            tenantId,
            m.marketId,
            i + 1,
            rule,
          ]);
        }
      } else if (m) {
        await q(
          'UPDATE markets SET status = $3, winning_outcome = $4, next_sequence = $5 WHERE tenant_id = $1 AND market_id = $2',
          [tenantId, m.marketId, m.status, m.winningOutcome, m.nextSequence],
        );
      }

      for (const o of decision.orders) {
        await q(
          `INSERT INTO orders (tenant_id, order_id, market_id, owner_id, outcome, price, quantity, filled_quantity, status, sequence, correlation_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (tenant_id, order_id) DO UPDATE SET filled_quantity = EXCLUDED.filled_quantity, status = EXCLUDED.status`,
          [
            tenantId,
            o.orderId,
            o.marketId,
            o.ownerId,
            o.outcome,
            o.price,
            o.quantity,
            o.filledQuantity,
            o.status,
            o.sequence,
            correlationId,
            o.createdAt,
          ],
        );
        await q(
          `INSERT INTO credit_reservations VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (tenant_id, order_id) DO UPDATE SET remaining_amount = EXCLUDED.remaining_amount`,
          [tenantId, o.orderId, o.ownerId, o.price * o.quantity, o.reservedRemaining],
        );
      }

      for (const f of decision.fills) {
        await q(
          'INSERT INTO fills VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
          [
            tenantId,
            f.fillId,
            f.marketId,
            f.takerOrderId,
            f.makerOrderId,
            f.yesOrderId,
            f.noOrderId,
            f.yesOwnerId,
            f.noOwnerId,
            f.quantity,
            f.yesPrice,
            f.sequence,
            eventId,
          ],
        );
      }

      const accounts = [
        ...new Set(decision.ledger.flatMap((t) => t.entries.map((e) => e.accountId))),
      ].sort();
      if (accounts.length) {
        await q(
          `INSERT INTO ledger_accounts (tenant_id, account_id, kind)
           SELECT $1, a, k FROM unnest($2::text[], $3::text[]) AS t(a, k) ON CONFLICT DO NOTHING`,
          [tenantId, accounts, accounts.map(accountKind)],
        );
      }
      for (const tx of decision.ledger) {
        await q(
          'INSERT INTO ledger_transactions (tenant_id, tx_id, reason, order_id, event_id, correlation_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [tenantId, tx.txId, tx.reason, tx.orderId, eventId, correlationId, event.occurredAt],
        );
        for (const [i, e] of tx.entries.entries()) {
          await q('INSERT INTO ledger_entries VALUES ($1, $2, $3, $4, $5, $6)', [
            tenantId,
            tx.txId,
            i + 1,
            e.accountId,
            e.direction,
            e.amount,
          ]);
        }
      }

      for (const p of decision.positions) {
        await q(
          `INSERT INTO positions VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (tenant_id, owner_id, market_id, outcome)
           DO UPDATE SET quantity = positions.quantity + EXCLUDED.quantity, cost = positions.cost + EXCLUDED.cost`,
          [tenantId, p.ownerId, p.marketId, p.outcome, p.quantity, p.cost],
        );
      }

      if (event.type === 'market.resolved') {
        await q('INSERT INTO market_resolutions VALUES ($1, $2, $3, $4, $5, $6)', [
          tenantId,
          event.payload.marketId,
          event.payload.winningOutcome,
          event.payload.source,
          event.eventId,
          event.occurredAt,
        ]);
      }
    }

    if (event) {
      await q(
        `INSERT INTO outbox_events (tenant_id, event_id, type, aggregate_id, correlation_id, causation_id, event, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tenantId,
          event.eventId,
          event.type,
          event.aggregateId,
          event.correlationId,
          event.causationId,
          event,
          event.occurredAt,
        ],
      );
    }
    await q(
      `INSERT INTO audit_log (tenant_id, actor, command_type, idempotency_scope, correlation_id, causation_id, outcome, policy, rejection_code, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        tenantId,
        command.meta.actor,
        command.payload.type,
        input.scope,
        correlationId,
        command.meta.causationId,
        result.status,
        input.policy,
        input.rejection?.code ?? null,
        eventId,
      ],
    );
    await q(
      'INSERT INTO idempotency_keys (tenant_id, scope, request_fingerprint, result) VALUES ($1, $2, $3, $4)',
      [tenantId, input.scope, input.requestFingerprint, result],
    );
  }
}
