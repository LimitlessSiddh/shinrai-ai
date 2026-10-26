import { z } from 'zod';
import { MarketDefinition } from './commands';
import {
  CreditCents,
  Id,
  IsoTime,
  Outcome,
  PriceCents,
  Quantity,
  RejectionCode,
} from './primitives';

export const MarketStatus = z.enum(['open', 'resolved']);

export const Market = MarketDefinition.extend({
  tenantId: Id,
  status: MarketStatus,
  winningOutcome: Outcome.nullable(),
  /** Monotonic per-market order sequence used for time priority. */
  nextSequence: z.number().int().nonnegative(),
  openedAt: IsoTime,
});
export type Market = z.infer<typeof Market>;

export const OrderStatus = z.enum(['open', 'filled', 'cancelled']);

export const Order = z.strictObject({
  orderId: Id,
  tenantId: Id,
  marketId: Id,
  ownerId: Id,
  outcome: Outcome,
  price: PriceCents,
  quantity: Quantity,
  filledQuantity: z.number().int().nonnegative(),
  status: OrderStatus,
  sequence: z.number().int().nonnegative(),
  /** Credit-cents still held in the owner's reserved account for this order. */
  reservedRemaining: CreditCents,
  createdAt: IsoTime,
});
export type Order = z.infer<typeof Order>;

export const Fill = z.strictObject({
  fillId: Id,
  marketId: Id,
  takerOrderId: Id,
  makerOrderId: Id,
  yesOrderId: Id,
  noOrderId: Id,
  yesOwnerId: Id,
  noOwnerId: Id,
  quantity: Quantity,
  /** Execution price for YES; NO pays 100 - yesPrice. Maker's price wins. */
  yesPrice: PriceCents,
  sequence: z.number().int().nonnegative(),
});
export type Fill = z.infer<typeof Fill>;

export const AccountKind = z.enum(['available', 'reserved', 'escrow', 'issuance']);
export type AccountKind = z.infer<typeof AccountKind>;

export const LedgerEntry = z.strictObject({
  accountId: Id,
  direction: z.enum(['debit', 'credit']),
  amount: CreditCents.positive(),
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

export const LedgerReason = z.enum(['grant', 'reserve', 'fill', 'release', 'settle']);
export const LedgerTransaction = z.strictObject({
  txId: Id,
  reason: LedgerReason,
  orderId: Id.nullable(),
  entries: z.array(LedgerEntry).min(2),
});
export type LedgerTransaction = z.infer<typeof LedgerTransaction>;

export const Position = z.strictObject({
  ownerId: Id,
  marketId: Id,
  outcome: Outcome,
  quantity: z.number().int().nonnegative(),
  /** Total credit-cents paid for these contracts. */
  cost: CreditCents,
});
export type Position = z.infer<typeof Position>;

export const Payout = z.strictObject({ ownerId: Id, amount: CreditCents });

export const Rejection = z.strictObject({ code: RejectionCode, message: z.string() });
export type Rejection = z.infer<typeof Rejection>;
