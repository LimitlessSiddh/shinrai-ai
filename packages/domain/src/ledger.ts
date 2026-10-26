import type { LedgerEntry, LedgerTransaction } from '@shinrai/contracts';

export const ISSUANCE_ACCOUNT = 'system:issuance';
export const availableAccount = (ownerId: string) => `agent:${ownerId}:available`;
export const reservedAccount = (ownerId: string) => `agent:${ownerId}:reserved`;
export const escrowAccount = (marketId: string) => `market:${marketId}:escrow`;

export type Transfer = { from: string; to: string; amount: number };

/** Builds one balanced transaction: each transfer debits `from` and credits `to`. Zero amounts are dropped. */
export function transaction(
  txId: string,
  reason: LedgerTransaction['reason'],
  orderId: string | null,
  transfers: readonly Transfer[],
): LedgerTransaction | null {
  const entries: LedgerEntry[] = [];
  for (const t of transfers) {
    if (!Number.isSafeInteger(t.amount) || t.amount < 0) {
      throw new Error(`ledger amount must be a non-negative safe integer: ${t.amount}`);
    }
    if (t.amount === 0) continue;
    entries.push({ accountId: t.from, direction: 'debit', amount: t.amount });
    entries.push({ accountId: t.to, direction: 'credit', amount: t.amount });
  }
  return entries.length === 0 ? null : { txId, reason, orderId, entries };
}

export function isBalanced(tx: LedgerTransaction): boolean {
  let net = 0;
  for (const e of tx.entries) net += e.direction === 'credit' ? e.amount : -e.amount;
  return net === 0 && tx.entries.length >= 2;
}

/** Balance convention: credits increase an account, debits decrease it. */
export function applyTransaction(balances: Map<string, number>, tx: LedgerTransaction): void {
  if (!isBalanced(tx)) throw new Error(`unbalanced ledger transaction ${tx.txId}`);
  for (const e of tx.entries) {
    const delta = e.direction === 'credit' ? e.amount : -e.amount;
    balances.set(e.accountId, (balances.get(e.accountId) ?? 0) + delta);
  }
}

/** Only the issuance account may go negative; it is the source of all paper credits. */
export function negativeAccounts(balances: ReadonlyMap<string, number>): string[] {
  return [...balances].filter(([id, v]) => id !== ISSUANCE_ACCOUNT && v < 0).map(([id]) => id);
}
