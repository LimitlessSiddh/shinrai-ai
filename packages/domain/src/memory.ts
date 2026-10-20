import type {
  Command,
  CommandResult,
  DomainEvent,
  Fill,
  LedgerTransaction,
  Market,
  Order,
  Position,
} from '@shinrai/contracts';
import { executeCommand, type CommandStore, type CommitInput, type PolicyRecord } from './executor';
import {
  applyTransaction,
  availableAccount,
  isBalanced,
  negativeAccounts,
  reservedAccount,
} from './ledger';
import type { Clock, Exchange, IdSource, MarketView, PortfolioView } from './ports';

type TenantState = {
  markets: Map<string, Market>;
  orders: Map<string, Order>;
  fills: Fill[];
  ledger: LedgerTransaction[];
  balances: Map<string, number>;
  positions: Map<string, Position>;
  events: DomainEvent[];
  idempotency: Map<string, { requestFingerprint: string; result: CommandResult }>;
};

const positionKey = (p: Pick<Position, 'ownerId' | 'marketId' | 'outcome'>) =>
  `${p.ownerId}|${p.marketId}|${p.outcome}`;

/**
 * Reference implementation of the exchange, used by unit tests and the offline evaluation harness.
 * It runs the exact same `executeCommand` path as the PostgreSQL adapter.
 */
export class InMemoryExchange implements Exchange {
  private readonly tenants = new Map<string, TenantState>();

  constructor(
    private readonly ids: IdSource,
    private readonly clock: Clock,
  ) {}

  tenant(tenantId: string): TenantState {
    let t = this.tenants.get(tenantId);
    if (!t) {
      t = {
        markets: new Map(),
        orders: new Map(),
        fills: [],
        ledger: [],
        balances: new Map(),
        positions: new Map(),
        events: [],
        idempotency: new Map(),
      };
      this.tenants.set(tenantId, t);
    }
    return t;
  }

  async execute(command: Command, policy?: PolicyRecord): Promise<CommandResult> {
    return executeCommand(command, {
      store: this.store(command.meta.actor.tenantId),
      ids: this.ids,
      clock: this.clock,
      ...(policy ? { policy } : {}),
    });
  }

  private store(tenantId: string): CommandStore {
    const t = this.tenant(tenantId);
    return {
      prepare: async () => undefined,
      findIdempotent: async (scope) => t.idempotency.get(scope) ?? null,
      market: async (_tenant, id) => t.markets.get(id) ?? null,
      balance: async (_tenant, accountId) => t.balances.get(accountId) ?? 0,
      openOrders: async (_tenant, marketId) =>
        [...t.orders.values()].filter((o) => o.marketId === marketId && o.status === 'open'),
      order: async (_tenant, id) => t.orders.get(id) ?? null,
      positions: async (_tenant, marketId) =>
        [...t.positions.values()].filter((p) => p.marketId === marketId),
      resolutionEvent: async (_tenant, marketId) =>
        t.events.find((e) => e.type === 'market.resolved' && e.aggregateId === marketId) ?? null,
      commit: async (input) => this.commit(t, input),
    };
  }

  /** Validate the whole write first, then apply it, so a failure leaves state untouched. */
  private commit(t: TenantState, input: CommitInput): void {
    const { decision } = input;
    const balances = new Map(t.balances);
    for (const tx of decision?.ledger ?? []) {
      if (!isBalanced(tx)) throw new Error(`unbalanced transaction ${tx.txId}`);
      applyTransaction(balances, tx);
    }
    const negative = negativeAccounts(balances);
    if (negative.length) throw new Error(`negative balance in ${negative.join(', ')}`);

    t.balances = balances;
    if (decision) {
      if (decision.market) t.markets.set(decision.market.marketId, decision.market);
      for (const o of decision.orders) t.orders.set(o.orderId, o);
      t.fills.push(...decision.fills);
      t.ledger.push(...decision.ledger);
      for (const d of decision.positions) {
        const key = positionKey(d);
        const prev = t.positions.get(key) ?? {
          ownerId: d.ownerId,
          marketId: d.marketId,
          outcome: d.outcome,
          quantity: 0,
          cost: 0,
        };
        t.positions.set(key, {
          ...prev,
          quantity: prev.quantity + d.quantity,
          cost: prev.cost + d.cost,
        });
      }
    }
    if (input.event) t.events.push(input.event);
    t.idempotency.set(input.scope, {
      requestFingerprint: input.requestFingerprint,
      result: input.result,
    });
  }

  async getMarket(tenantId: string, marketId: string): Promise<MarketView | null> {
    const t = this.tenant(tenantId);
    const market = t.markets.get(marketId);
    if (!market) return null;
    const open = [...t.orders.values()].filter(
      (o) => o.marketId === marketId && o.status === 'open',
    );
    const fills = t.fills.filter((f) => f.marketId === marketId);
    return marketView(market, open, fills);
  }

  async getPortfolio(tenantId: string, ownerId: string): Promise<PortfolioView> {
    const t = this.tenant(tenantId);
    return {
      ownerId,
      available: t.balances.get(availableAccount(ownerId)) ?? 0,
      reserved: t.balances.get(reservedAccount(ownerId)) ?? 0,
      positions: [...t.positions.values()].filter((p) => p.ownerId === ownerId),
      openOrders: [...t.orders.values()].filter(
        (o) => o.ownerId === ownerId && o.status === 'open',
      ),
    };
  }

  async events(tenantId: string): Promise<DomainEvent[]> {
    return [...this.tenant(tenantId).events];
  }

  async ledger(tenantId: string): Promise<LedgerTransaction[]> {
    return [...this.tenant(tenantId).ledger];
  }
}

/** Shared projection of a market's book; used by both adapters so views agree. */
export function marketView(
  market: Market,
  open: readonly Order[],
  fills: readonly Fill[],
): MarketView {
  const bestBid = (outcome: 'YES' | 'NO') =>
    open
      .filter((o) => o.outcome === outcome)
      .reduce<number | null>((m, o) => (m === null || o.price > m ? o.price : m), null);
  const bestNoBid = bestBid('NO');
  const bestYesBid = bestBid('YES');
  const ordered = [...fills].sort((a, b) => a.sequence - b.sequence);
  return {
    market,
    bestAsk: {
      YES: bestNoBid === null ? null : 100 - bestNoBid,
      NO: bestYesBid === null ? null : 100 - bestYesBid,
    },
    lastYesPrice: ordered.at(-1)?.yesPrice ?? null,
    openingYesPrice: ordered[0]?.yesPrice ?? null,
    matchedContracts: ordered.reduce((s, f) => s + f.quantity, 0),
    openOrders: open.length,
  };
}
