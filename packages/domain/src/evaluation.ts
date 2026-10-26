import type { LedgerTransaction, Outcome } from '@shinrai/contracts';
import { availableAccount, reservedAccount } from './ledger';

export type Forecast = { marketId: string; probabilityYes: number; outcome: Outcome };

export type EvaluationInput = {
  forecasts: readonly Forecast[];
  /** Agent equity after each ledger transaction that touched it, starting with the opening balance. */
  equityCurve: readonly number[];
  orderRequests: { total: number; blocked: number };
  toolCalls: { total: number; ok: number };
};

export type EvaluationReport = {
  forecasts: number;
  brierScore: number | null;
  logLoss: number | null;
  startingCredits: number;
  endingCredits: number;
  paperPnl: number;
  maxDrawdown: number;
  policyAdherence: number;
  policyViolations: number;
  toolCallSuccessRate: number;
  equityCurve: number[];
};

const EPSILON = 1e-6;
/** Rounded to 6 places so reports serialize identically across runs and platforms. */
const round = (x: number) => Math.round(x * 1e6) / 1e6;

export function brierScore(forecasts: readonly Forecast[]): number | null {
  if (!forecasts.length) return null;
  const sum = forecasts.reduce(
    (s, f) => s + (f.probabilityYes - (f.outcome === 'YES' ? 1 : 0)) ** 2,
    0,
  );
  return round(sum / forecasts.length);
}

export function logLoss(forecasts: readonly Forecast[]): number | null {
  if (!forecasts.length) return null;
  const sum = forecasts.reduce((s, f) => {
    const p = Math.min(1 - EPSILON, Math.max(EPSILON, f.probabilityYes));
    return s - (f.outcome === 'YES' ? Math.log(p) : Math.log(1 - p));
  }, 0);
  return round(sum / forecasts.length);
}

/** Largest peak-to-trough fall as a fraction of the peak. */
export function maxDrawdown(curve: readonly number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of curve) {
    peak = Math.max(peak, v);
    if (peak > 0) worst = Math.max(worst, (peak - v) / peak);
  }
  return round(worst);
}

/**
 * Agent equity at cost: available + reserved + credits it has paid into escrow for open positions.
 * Settlement zeroes the escrow share (the payout lands in available).
 */
export function equityCurve(ledger: readonly LedgerTransaction[], ownerId: string): number[] {
  const avail = availableAccount(ownerId);
  const reserved = reservedAccount(ownerId);
  let cash = 0;
  const inEscrow = new Map<string, number>();
  const curve: number[] = [];
  for (const tx of ledger) {
    let touched = false;
    for (let i = 0; i + 1 < tx.entries.length; i += 2) {
      const debit = tx.entries[i];
      const credit = tx.entries[i + 1];
      if (!debit || !credit) continue;
      const mine = (id: string) => id === avail || id === reserved;
      if (mine(debit.accountId)) {
        cash -= debit.amount;
        touched = true;
        if (credit.accountId.startsWith('market:')) {
          inEscrow.set(credit.accountId, (inEscrow.get(credit.accountId) ?? 0) + debit.amount);
        }
      }
      if (mine(credit.accountId)) {
        cash += credit.amount;
        touched = true;
      }
    }
    if (tx.reason === 'settle') {
      // Win or lose, the agent's stake in this market's escrow is gone after settlement.
      for (const e of tx.entries) {
        if (inEscrow.get(e.accountId)) {
          inEscrow.set(e.accountId, 0);
          touched = true;
        }
      }
    }
    if (touched) curve.push(cash + [...inEscrow.values()].reduce((s, v) => s + v, 0));
  }
  return curve;
}

export function evaluate(input: EvaluationInput): EvaluationReport {
  const curve = [...input.equityCurve];
  const start = curve[0] ?? 0;
  const end = curve.at(-1) ?? 0;
  const { total, blocked } = input.orderRequests;
  return {
    forecasts: input.forecasts.length,
    brierScore: brierScore(input.forecasts),
    logLoss: logLoss(input.forecasts),
    startingCredits: start,
    endingCredits: end,
    paperPnl: end - start,
    maxDrawdown: maxDrawdown(curve),
    policyAdherence: total === 0 ? 1 : round((total - blocked) / total),
    policyViolations: blocked,
    toolCallSuccessRate:
      input.toolCalls.total === 0 ? 1 : round(input.toolCalls.ok / input.toolCalls.total),
    equityCurve: curve,
  };
}
