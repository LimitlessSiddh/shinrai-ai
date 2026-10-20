import type { Market, MarketDefinition, Order, Outcome, Position } from '@shinrai/contracts';

export const ORDER_COLUMNS = `
  o.tenant_id, o.order_id, o.market_id, o.owner_id, o.outcome, o.price, o.quantity,
  o.filled_quantity, o.status, o.sequence, o.created_at, r.remaining_amount`;

export const ORDER_FROM = `orders o JOIN credit_reservations r USING (tenant_id, order_id)`;

type OrderRow = {
  tenant_id: string;
  order_id: string;
  market_id: string;
  owner_id: string;
  outcome: Outcome;
  price: number;
  quantity: number;
  filled_quantity: number;
  status: Order['status'];
  sequence: number;
  created_at: string;
  remaining_amount: number;
};

export const toOrder = (r: OrderRow): Order => ({
  orderId: r.order_id,
  tenantId: r.tenant_id,
  marketId: r.market_id,
  ownerId: r.owner_id,
  outcome: r.outcome,
  price: r.price,
  quantity: r.quantity,
  filledQuantity: r.filled_quantity,
  status: r.status,
  sequence: r.sequence,
  reservedRemaining: r.remaining_amount,
  createdAt: r.created_at,
});

type MarketRow = {
  tenant_id: string;
  definition: MarketDefinition;
  status: Market['status'];
  winning_outcome: Outcome | null;
  next_sequence: number;
  opened_at: string;
};

export const toMarket = (r: MarketRow): Market => ({
  ...r.definition,
  tenantId: r.tenant_id,
  status: r.status,
  winningOutcome: r.winning_outcome,
  nextSequence: r.next_sequence,
  openedAt: r.opened_at,
});

type PositionRow = {
  owner_id: string;
  market_id: string;
  outcome: Outcome;
  quantity: number;
  cost: number;
};

export const toPosition = (r: PositionRow): Position => ({
  ownerId: r.owner_id,
  marketId: r.market_id,
  outcome: r.outcome,
  quantity: r.quantity,
  cost: r.cost,
});

export function accountKind(accountId: string): 'available' | 'reserved' | 'escrow' | 'issuance' {
  if (accountId === 'system:issuance') return 'issuance';
  if (accountId.startsWith('market:')) return 'escrow';
  if (accountId.endsWith(':reserved')) return 'reserved';
  return 'available';
}
