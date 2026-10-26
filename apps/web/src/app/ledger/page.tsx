'use client';

import Link from 'next/link';
import { BookOpenCheck, Landmark, Scale } from 'lucide-react';
import { useState } from 'react';
import { Empty, ErrorState, LoadingPanel, PageHeader, Panel, Stat, Status } from '@/components/ui';
import { credits, time, usePoll } from '@/lib/api';
import type { LedgerDto } from '@/lib/types';

const REASONS = ['all', 'grant', 'reserve', 'fill', 'release', 'settle'] as const;

export default function LedgerPage() {
  const ledger = usePoll<LedgerDto>('/ledger?limit=120', 3000);
  const [reason, setReason] = useState<(typeof REASONS)[number]>('all');

  if (ledger.error) return <ErrorState error={ledger.error} onRetry={ledger.refresh} />;
  if (!ledger.data) return <LoadingPanel label="ledger" rows={6} />;
  const { accounts, transactions } = ledger.data;
  const net = accounts.reduce((s, a) => s + a.balance, 0);
  const sum = (kind: string) =>
    accounts.filter((a) => a.kind === kind).reduce((s, a) => s + a.balance, 0);
  const txs = transactions.filter((t) => reason === 'all' || t.reason === reason);
  const owners = [
    ...new Set(
      accounts
        .filter((a) => a.kind === 'available' || a.kind === 'reserved')
        .map((a) => a.account_id.split(':')[1] ?? ''),
    ),
  ].sort();
  const bal = (id: string) => accounts.find((a) => a.account_id === id)?.balance ?? 0;

  return (
    <div className="stack settle" style={{ gap: 'var(--space-5)' }}>
      <PageHeader
        title="Ledger"
        description="Append-only double-entry accounting for paper credits. Every transaction debits and credits the same amount; PostgreSQL rejects anything else at commit."
        actions={
          net === 0 ? (
            <Status tone="success" icon={Scale}>
              Books balance · net 0.00
            </Status>
          ) : (
            <Status tone="danger">Out of balance · {credits(net)}</Status>
          )
        }
      />
      <div className="kpis">
        <Stat
          label="Available"
          value={credits(sum('available'))}
          hint="spendable across participants"
          testId="ledger-available"
        />
        <Stat label="Reserved" value={credits(sum('reserved'))} hint="held by open orders" />
        <Stat label="Escrow" value={credits(sum('escrow'))} hint="100 per matched pair" />
        <Stat
          label="Issuance"
          value={credits(sum('issuance'))}
          hint="source of all credits; negative by design"
        />
      </div>

      <div className="grid cols-main">
        <Panel
          title="Journal"
          icon={BookOpenCheck}
          id="journal"
          flush
          actions={
            <div className="chips" role="group" aria-label="Filter by transaction type">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="chip"
                  aria-pressed={reason === r}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          }
        >
          {txs.length === 0 ? (
            <Empty icon={BookOpenCheck} title="No transactions yet" />
          ) : (
            <div className="table-wrap" style={{ maxHeight: 720, overflowY: 'auto' }}>
              <table className="table" data-testid="journal">
                <caption className="visually-hidden">
                  Ledger journal, newest first, one block per balanced transaction
                </caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Type</th>
                    <th scope="col">Account</th>
                    <th scope="col" className="num">
                      Debit
                    </th>
                    <th scope="col" className="num">
                      Credit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {txs.flatMap((t) =>
                    t.entries.map((e, i) => (
                      <tr
                        key={`${t.tx_id}-${e.entryNo}`}
                        className={`journal-entry${i === 0 ? ' first' : ''}`}
                      >
                        <td className="mono faint">{i === 0 ? t.seq : ''}</td>
                        <td>
                          {i === 0 ? (
                            <span className="stack-sm" style={{ gap: 2 }}>
                              <span className="tag">{t.reason}</span>
                              <Link
                                href={`/dossier/?trace=${encodeURIComponent(t.correlation_id)}`}
                                className="label"
                                style={{ textTransform: 'none', letterSpacing: 0 }}
                              >
                                {time(t.created_at)} · trace
                              </Link>
                            </span>
                          ) : null}
                        </td>
                        <td
                          className={`mono wrap-any${e.direction === 'credit' ? ' credit-indent' : ''}`}
                          style={{ fontSize: 'var(--text-sm)' }}
                        >
                          {e.accountId}
                        </td>
                        <td className="num">{e.direction === 'debit' ? credits(e.amount) : ''}</td>
                        <td className="num">{e.direction === 'credit' ? credits(e.amount) : ''}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Accounts" icon={Landmark} id="accounts" flush>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">
                Balances by participant and system account
              </caption>
              <thead>
                <tr>
                  <th scope="col">Participant</th>
                  <th scope="col" className="num">
                    Available
                  </th>
                  <th scope="col" className="num">
                    Reserved
                  </th>
                </tr>
              </thead>
              <tbody>
                {owners.map((o) => (
                  <tr key={o}>
                    <th scope="row" className="mono" style={{ fontWeight: 500 }}>
                      {o}
                    </th>
                    <td className="num">{credits(bal(`agent:${o}:available`))}</td>
                    <td className="num faint">{credits(bal(`agent:${o}:reserved`))}</td>
                  </tr>
                ))}
                {accounts
                  .filter((a) => a.kind === 'escrow' || a.kind === 'issuance')
                  .map((a) => (
                    <tr key={a.account_id}>
                      <th scope="row" className="mono wrap-any" style={{ fontWeight: 500 }}>
                        {a.account_id}
                      </th>
                      <td className="num" colSpan={2}>
                        {credits(a.balance)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
