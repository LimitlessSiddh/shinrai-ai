import { describe, expect, it } from 'vitest';
import {
  applyTransaction,
  isBalanced,
  ISSUANCE_ACCOUNT,
  negativeAccounts,
  transaction,
} from '@shinrai/domain';
import { agent, cmd, MARKET_ID } from '../support/commands';
import { seededExchange } from '../support/memory';

describe('double-entry ledger', () => {
  it('builds balanced transactions and drops zero transfers', () => {
    const tx = transaction('t1', 'fill', null, [
      { from: 'a', to: 'b', amount: 50 },
      { from: 'a', to: 'c', amount: 0 },
    ]);
    expect(tx?.entries).toHaveLength(2);
    expect(tx && isBalanced(tx)).toBe(true);
    expect(transaction('t2', 'grant', null, [{ from: 'a', to: 'b', amount: 0 }])).toBeNull();
  });

  it('refuses non-integer or negative amounts', () => {
    expect(() => transaction('t', 'grant', null, [{ from: 'a', to: 'b', amount: 1.5 }])).toThrow();
    expect(() => transaction('t', 'grant', null, [{ from: 'a', to: 'b', amount: -1 }])).toThrow();
  });

  it('rejects applying an unbalanced transaction', () => {
    const balances = new Map<string, number>();
    expect(() =>
      applyTransaction(balances, {
        txId: 'bad',
        reason: 'grant',
        orderId: null,
        entries: [
          { accountId: 'a', direction: 'debit', amount: 5 },
          { accountId: 'b', direction: 'credit', amount: 4 },
        ],
      }),
    ).toThrow(/unbalanced/);
    expect(balances.size).toBe(0);
  });

  it('keeps every accepted movement balanced and no account negative', async () => {
    const ex = await seededExchange();
    await ex.execute(
      cmd(agent('alice'), {
        type: 'PlaceOrder',
        marketId: MARKET_ID,
        outcome: 'YES',
        price: 58,
        quantity: 50,
      }),
    );
    await ex.execute(
      cmd(agent('bob'), {
        type: 'PlaceOrder',
        marketId: MARKET_ID,
        outcome: 'NO',
        price: 45,
        quantity: 30,
      }),
    );

    const t = ex.tenant('demo');
    expect(t.ledger.every(isBalanced)).toBe(true);
    expect(negativeAccounts(t.balances)).toEqual([]);
    const total = [...t.balances.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(0); // credits only move; issuance is the mirror of everything granted
    expect(t.balances.get(ISSUANCE_ACCOUNT)).toBe(-20_000);
  });

  it('rejects an overspend without touching orders, reservations or the ledger', async () => {
    const ex = await seededExchange({ alice: 1_000 });
    const before = structuredClone(ex.tenant('demo'));
    const result = await ex.execute(
      cmd(agent('alice'), {
        type: 'PlaceOrder',
        marketId: MARKET_ID,
        outcome: 'YES',
        price: 60,
        quantity: 20,
      }),
    );
    expect(result).toMatchObject({ status: 'rejected', code: 'INSUFFICIENT_CREDITS' });
    const after = ex.tenant('demo');
    expect(after.orders).toEqual(before.orders);
    expect(after.ledger).toEqual(before.ledger);
    expect(after.balances).toEqual(before.balances);
    expect(after.fills).toEqual(before.fills);
    expect(after.events.at(-1)?.type).toBe('command.rejected');
  });
});
