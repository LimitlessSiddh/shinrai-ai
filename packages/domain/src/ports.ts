import type { PolicyRecord } from './executor';
import type {
  Command,
  CommandResult,
  DomainEvent,
  Market,
  Order,
  Position,
} from '@shinrai/contracts';

/** Source of unique identifiers. Deterministic in tests and replays. */
export interface IdSource {
  next(kind: string): string;
}

export interface Clock {
  now(): string;
}

/** Monotonic counter ids, e.g. `order-000001`. Same seed and call order give the same ids. */
export function counterIds(prefix = ''): IdSource {
  const counters = new Map<string, number>();
  return {
    next(kind) {
      const n = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, n);
      return `${prefix}${kind}-${String(n).padStart(6, '0')}`;
    },
  };
}

/** A clock that advances one second per call from a fixed start. */
export function steppingClock(startIso: string, stepMs = 1000): Clock {
  let t = Date.parse(startIso);
  return {
    now() {
      const iso = new Date(t).toISOString();
      t += stepMs;
      return iso;
    },
  };
}

export const systemClock: Clock = { now: () => new Date().toISOString() };

export type MarketView = {
  market: Market;
  /** Cheapest price to buy each outcome now (100 - best resting opposite bid), or null. */
  bestAsk: { YES: number | null; NO: number | null };
  lastYesPrice: number | null;
  openingYesPrice: number | null;
  matchedContracts: number;
  openOrders: number;
};

export type PortfolioView = {
  ownerId: string;
  available: number;
  reserved: number;
  positions: Position[];
  openOrders: Order[];
};

/** The command/query surface shared by the in-memory engine and the PostgreSQL adapter. */
export interface Exchange {
  execute(command: Command, policy?: PolicyRecord): Promise<CommandResult>;
  getMarket(tenantId: string, marketId: string): Promise<MarketView | null>;
  getPortfolio(tenantId: string, ownerId: string): Promise<PortfolioView>;
  events(tenantId: string): Promise<DomainEvent[]>;
}

/** Durable at-least-once event transport. Consumers must be idempotent. */
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
}
