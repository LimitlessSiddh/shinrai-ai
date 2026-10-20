import type {
  Actor,
  CancelOrder,
  DomainEvent,
  Fill,
  GrantCredits,
  LedgerTransaction,
  Market,
  OpenMarket,
  Order,
  PlaceOrder,
  Position,
  Rejection,
  ResolveMarket,
} from '@shinrai/contracts';
import {
  availableAccount,
  escrowAccount,
  ISSUANCE_ACCOUNT,
  reservedAccount,
  transaction,
} from './ledger';
import { matchOrder, type PositionDelta } from './matching';
import type { IdSource } from './ports';

type DraftOf<E> = E extends DomainEvent ? Pick<E, 'type' | 'aggregateId' | 'payload'> : never;
export type EventDraft = DraftOf<DomainEvent>;

/** Everything a command changes. Adapters persist it atomically; nothing else may mutate state. */
export type Decision = {
  market: Market | null;
  orders: Order[];
  fills: Fill[];
  ledger: LedgerTransaction[];
  positions: PositionDelta[];
  event: EventDraft;
};

export type Decided = { ok: true; decision: Decision } | { ok: false; rejection: Rejection };

const reject = (code: Rejection['code'], message: string): Decided => ({
  ok: false,
  rejection: { code, message },
});
const accept = (
  d: Omit<Decision, 'market' | 'orders' | 'fills' | 'ledger' | 'positions'> & Partial<Decision>,
): Decided => ({
  ok: true,
  decision: { market: null, orders: [], fills: [], ledger: [], positions: [], ...d },
});

const privileged = (actor: Actor) => actor.kind !== 'agent';

export function decideOpenMarket(
  cmd: OpenMarket,
  actor: Actor,
  existing: Market | null,
  now: string,
): Decided {
  if (!privileged(actor)) return reject('FORBIDDEN', 'agents cannot open markets');
  if (existing)
    return reject('MARKET_ALREADY_EXISTS', `market ${cmd.market.marketId} already exists`);
  const market: Market = {
    ...cmd.market,
    tenantId: actor.tenantId,
    status: 'open',
    winningOutcome: null,
    nextSequence: 1,
    openedAt: now,
  };
  return accept({
    market,
    event: { type: 'market.opened', aggregateId: market.marketId, payload: { market: cmd.market } },
  });
}

export function decideGrant(cmd: GrantCredits, actor: Actor, ids: IdSource): Decided {
  if (!privileged(actor)) return reject('FORBIDDEN', 'agents cannot grant credits');
  const tx = transaction(ids.next('ltx'), 'grant', null, [
    { from: ISSUANCE_ACCOUNT, to: availableAccount(cmd.ownerId), amount: cmd.amount },
  ]);
  if (!tx) return reject('VALIDATION_FAILED', 'grant amount must be positive');
  return accept({
    ledger: [tx],
    event: {
      type: 'credits.granted',
      aggregateId: cmd.ownerId,
      payload: { ownerId: cmd.ownerId, amount: cmd.amount, ledgerTxIds: [tx.txId] },
    },
  });
}

export type PlaceOrderContext = {
  market: Market | null;
  /** Owner's available balance in credit-cents. */
  available: number;
  /** Open orders in this market (any outcome). */
  book: readonly Order[];
};

export function decidePlaceOrder(
  cmd: PlaceOrder,
  actor: Actor,
  ctx: PlaceOrderContext,
  ids: IdSource,
  now: string,
): Decided {
  const { market } = ctx;
  if (!market) return reject('MARKET_NOT_FOUND', `market ${cmd.marketId} not found`);
  if (market.status !== 'open')
    return reject('MARKET_NOT_OPEN', `market ${cmd.marketId} is ${market.status}`);
  const cost = cmd.price * cmd.quantity;
  if (cost > ctx.available) {
    return reject(
      'INSUFFICIENT_CREDITS',
      `order needs ${cost} credit-cents; ${ctx.available} available`,
    );
  }

  const order: Order = {
    orderId: ids.next('order'),
    tenantId: actor.tenantId,
    marketId: market.marketId,
    ownerId: actor.actorId,
    outcome: cmd.outcome,
    price: cmd.price,
    quantity: cmd.quantity,
    filledQuantity: 0,
    status: 'open',
    sequence: market.nextSequence,
    reservedRemaining: cost,
    createdAt: now,
  };
  const reserve = transaction(ids.next('ltx'), 'reserve', order.orderId, [
    { from: availableAccount(actor.actorId), to: reservedAccount(actor.actorId), amount: cost },
  ]);
  if (!reserve) return reject('VALIDATION_FAILED', 'order cost must be positive');

  const m = matchOrder(order, ctx.book, ids, market.nextSequence + 1);
  const ledger = [reserve, ...m.ledger];
  return accept({
    market: { ...market, nextSequence: m.nextSequence },
    orders: [m.taker, ...m.makers],
    fills: m.fills,
    ledger,
    positions: m.positions,
    event: {
      type: 'order.placed',
      aggregateId: market.marketId,
      payload: { order: m.taker, fills: m.fills, ledgerTxIds: ledger.map((t) => t.txId) },
    },
  });
}

export function decideCancel(
  cmd: CancelOrder,
  actor: Actor,
  order: Order | null,
  ids: IdSource,
): Decided {
  if (!order || order.tenantId !== actor.tenantId)
    return reject('ORDER_NOT_FOUND', `order ${cmd.orderId} not found`);
  if (order.ownerId !== actor.actorId)
    return reject('FORBIDDEN', 'only the owner may cancel an order');
  if (order.status !== 'open') return reject('ORDER_NOT_CANCELLABLE', `order is ${order.status}`);
  const release = transaction(ids.next('ltx'), 'release', order.orderId, [
    {
      from: reservedAccount(order.ownerId),
      to: availableAccount(order.ownerId),
      amount: order.reservedRemaining,
    },
  ]);
  return accept({
    orders: [{ ...order, status: 'cancelled', reservedRemaining: 0 }],
    ledger: release ? [release] : [],
    event: {
      type: 'order.cancelled',
      aggregateId: order.marketId,
      payload: {
        orderId: order.orderId,
        marketId: order.marketId,
        released: order.reservedRemaining,
        ledgerTxIds: release ? [release.txId] : [],
      },
    },
  });
}

export type ResolveContext = {
  market: Market | null;
  openOrders: readonly Order[];
  positions: readonly Position[];
  escrowBalance: number;
};

/** Business-level exactly-once: resolving again with the same outcome is a no-op, not a second payout. */
export type ResolveDecided = Decided | { ok: 'already'; outcome: Market['winningOutcome'] };

export function decideResolve(
  cmd: ResolveMarket,
  actor: Actor,
  ctx: ResolveContext,
  ids: IdSource,
): ResolveDecided {
  if (!privileged(actor)) return reject('FORBIDDEN', 'agents cannot resolve markets');
  const { market } = ctx;
  if (!market) return reject('MARKET_NOT_FOUND', `market ${cmd.marketId} not found`);
  if (market.status === 'resolved') {
    return market.winningOutcome === cmd.winningOutcome
      ? { ok: 'already', outcome: market.winningOutcome }
      : reject('RESOLUTION_CONFLICT', `market already resolved ${market.winningOutcome}`);
  }

  const ledger: LedgerTransaction[] = [];
  const cancelled: Order[] = [];
  for (const o of [...ctx.openOrders].sort((a, b) => a.sequence - b.sequence)) {
    const tx = transaction(ids.next('ltx'), 'release', o.orderId, [
      {
        from: reservedAccount(o.ownerId),
        to: availableAccount(o.ownerId),
        amount: o.reservedRemaining,
      },
    ]);
    if (tx) ledger.push(tx);
    cancelled.push({ ...o, status: 'cancelled', reservedRemaining: 0 });
  }

  const payouts = new Map<string, number>();
  for (const p of ctx.positions) {
    if (p.outcome === cmd.winningOutcome && p.quantity > 0) {
      payouts.set(p.ownerId, (payouts.get(p.ownerId) ?? 0) + 100 * p.quantity);
    }
  }
  const owners = [...payouts.keys()].sort();
  const totalPayout = owners.reduce((s, o) => s + (payouts.get(o) ?? 0), 0);
  // Defensive invariant: escrow holds exactly 100 per matched pair, so winners drain it to zero.
  if (totalPayout !== ctx.escrowBalance) {
    throw new Error(
      `escrow invariant violated: escrow ${ctx.escrowBalance} != payout ${totalPayout}`,
    );
  }
  const settle = transaction(
    ids.next('ltx'),
    'settle',
    null,
    owners.map((o) => ({
      from: escrowAccount(market.marketId),
      to: availableAccount(o),
      amount: payouts.get(o) ?? 0,
    })),
  );
  if (settle) ledger.push(settle);

  return accept({
    market: { ...market, status: 'resolved', winningOutcome: cmd.winningOutcome },
    orders: cancelled,
    ledger,
    event: {
      type: 'market.resolved',
      aggregateId: market.marketId,
      payload: {
        marketId: market.marketId,
        winningOutcome: cmd.winningOutcome,
        source: cmd.source,
        payouts: owners.map((ownerId) => ({ ownerId, amount: payouts.get(ownerId) ?? 0 })),
        cancelledOrderIds: cancelled.map((o) => o.orderId),
        ledgerTxIds: ledger.map((t) => t.txId),
      },
    },
  });
}
