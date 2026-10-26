import type { MarketDetail, OrderRequest, RunSummary } from './types';

/** Display-only derivations from server data. No business rules live here. */
export function isOrderRequest(x: unknown): x is OrderRequest {
  return typeof x === 'object' && x !== null && 'outcome' in x && 'price' in x && 'quantity' in x;
}

/** The current thesis: the newest run that asked to trade with a well-formed order. */
export function activeThesis(runs: RunSummary[]): RunSummary | null {
  return runs.find((r) => isOrderRequest(r.order_request)) ?? null;
}

/** Last traded YES price, else the best ask, else null. */
export function yesPrice(d: MarketDetail): number | null {
  const v = d.projection?.view;
  return v ? (v.lastYesPrice ?? v.bestAsk.YES) : null;
}

export const shortId = (id: string) => (id.length > 14 ? `${id.slice(0, 12)}…` : id);
