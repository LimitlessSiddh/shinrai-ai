import type { Fill, LedgerTransaction, Order, Outcome } from '@shinrai/contracts';
import {
  availableAccount,
  escrowAccount,
  reservedAccount,
  transaction,
  type Transfer,
} from './ledger';
import type { IdSource } from './ports';

export type PositionDelta = {
  ownerId: string;
  marketId: string;
  outcome: Outcome;
  quantity: number;
  cost: number;
};

export type MatchResult = {
  taker: Order;
  makers: Order[];
  fills: Fill[];
  ledger: LedgerTransaction[];
  positions: PositionDelta[];
  nextSequence: number;
};

const remaining = (o: Order) => o.quantity - o.filledQuantity;

/**
 * Best resting orders for a taker: the opposite outcome, crossing (p_taker + p_maker >= 100),
 * highest maker price first (cheapest complement for the taker), then oldest sequence.
 */
export function crossingMakers(
  taker: Pick<Order, 'outcome' | 'price' | 'ownerId'>,
  book: readonly Order[],
): Order[] {
  return book
    .filter(
      (o) => o.status === 'open' && o.outcome !== taker.outcome && o.price + taker.price >= 100,
    )
    .sort((a, b) => b.price - a.price || a.sequence - b.sequence);
}

/**
 * Deterministic price-time matching. Each fill mints a YES/NO pair: the maker pays its own limit,
 * the taker pays 100 - maker price (never more than its limit) and is refunded any improvement.
 * Escrow therefore always receives exactly 100 credit-cents per matched pair.
 */
export function matchOrder(
  takerIn: Order,
  book: readonly Order[],
  ids: IdSource,
  startSequence: number,
): MatchResult {
  let taker = { ...takerIn };
  let nextSequence = startSequence;
  const makers: Order[] = [];
  const fills: Fill[] = [];
  const ledger: LedgerTransaction[] = [];
  const positions: PositionDelta[] = [];
  const escrow = escrowAccount(taker.marketId);

  for (const makerIn of crossingMakers(taker, book)) {
    if (remaining(taker) === 0) break;
    const qty = Math.min(remaining(taker), remaining(makerIn));
    const makerPays = makerIn.price;
    const takerPays = 100 - makerIn.price;
    const improvement = taker.price - takerPays;

    const fill: Fill = {
      fillId: ids.next('fill'),
      marketId: taker.marketId,
      takerOrderId: taker.orderId,
      makerOrderId: makerIn.orderId,
      yesOrderId: taker.outcome === 'YES' ? taker.orderId : makerIn.orderId,
      noOrderId: taker.outcome === 'YES' ? makerIn.orderId : taker.orderId,
      yesOwnerId: taker.outcome === 'YES' ? taker.ownerId : makerIn.ownerId,
      noOwnerId: taker.outcome === 'YES' ? makerIn.ownerId : taker.ownerId,
      quantity: qty,
      yesPrice: taker.outcome === 'YES' ? takerPays : makerPays,
      sequence: nextSequence++,
    };
    fills.push(fill);

    const transfers: Transfer[] = [
      { from: reservedAccount(makerIn.ownerId), to: escrow, amount: makerPays * qty },
      { from: reservedAccount(taker.ownerId), to: escrow, amount: takerPays * qty },
      {
        from: reservedAccount(taker.ownerId),
        to: availableAccount(taker.ownerId),
        amount: improvement * qty,
      },
    ];
    const tx = transaction(ids.next('ltx'), 'fill', taker.orderId, transfers);
    if (tx) ledger.push(tx);

    const maker: Order = {
      ...makerIn,
      filledQuantity: makerIn.filledQuantity + qty,
      reservedRemaining: makerIn.reservedRemaining - makerPays * qty,
    };
    if (remaining(maker) === 0) maker.status = 'filled';
    makers.push(maker);

    taker = {
      ...taker,
      filledQuantity: taker.filledQuantity + qty,
      reservedRemaining: taker.reservedRemaining - taker.price * qty,
    };
    if (remaining(taker) === 0) taker.status = 'filled';

    positions.push(
      {
        ownerId: maker.ownerId,
        marketId: maker.marketId,
        outcome: maker.outcome,
        quantity: qty,
        cost: makerPays * qty,
      },
      {
        ownerId: taker.ownerId,
        marketId: taker.marketId,
        outcome: taker.outcome,
        quantity: qty,
        cost: takerPays * qty,
      },
    );
  }
  return { taker, makers, fills, ledger, positions, nextSequence };
}
