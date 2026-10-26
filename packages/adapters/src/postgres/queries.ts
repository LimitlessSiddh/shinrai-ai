import type { Fill } from '@shinrai/contracts';
import {
  availableAccount,
  marketView,
  reservedAccount,
  type MarketView,
  type PortfolioView,
} from '@shinrai/domain';
import type pg from 'pg';
import { ORDER_COLUMNS, ORDER_FROM, toMarket, toOrder, toPosition } from './rows';

/** Anything that can run a query: a pool or a client inside a transaction. */
export type Queryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

/** Authoritative market view computed from source facts (markets, open orders, fills). */
export async function readMarketView(
  db: Queryable,
  tenantId: string,
  marketId: string,
): Promise<MarketView | null> {
  const m = await db.query(
    'SELECT tenant_id, definition, status, winning_outcome, next_sequence, opened_at FROM markets WHERE tenant_id = $1 AND market_id = $2',
    [tenantId, marketId],
  );
  if (!m.rows[0]) return null;
  const open = await db.query(
    `SELECT ${ORDER_COLUMNS} FROM ${ORDER_FROM} WHERE o.tenant_id = $1 AND o.market_id = $2 AND o.status = 'open'`,
    [tenantId, marketId],
  );
  const fills = await db.query<{ quantity: number; yes_price: number; sequence: number }>(
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

/** Authoritative portfolio computed from ledger balances, positions and open orders. */
export async function readPortfolio(
  db: Queryable,
  tenantId: string,
  ownerId: string,
): Promise<PortfolioView> {
  const balances = await db.query<{ account_id: string; balance: number }>(
    'SELECT account_id, balance FROM ledger_accounts WHERE tenant_id = $1 AND account_id = ANY($2::text[])',
    [tenantId, [availableAccount(ownerId), reservedAccount(ownerId)]],
  );
  const bal = (id: string) => balances.rows.find((r) => r.account_id === id)?.balance ?? 0;
  const positions = await db.query(
    'SELECT owner_id, market_id, outcome, quantity, cost FROM positions WHERE tenant_id = $1 AND owner_id = $2 ORDER BY market_id, outcome',
    [tenantId, ownerId],
  );
  const open = await db.query(
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
