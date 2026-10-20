'use client';

import Link from 'next/link';
import {
  Activity as ActivityIcon,
  Bot,
  CheckCircle2,
  Info,
  ShieldX,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { credits, time, usePoll } from '@/lib/api';
import type { ActivityRow, PortfolioDto } from '@/lib/types';
import { ErrorState, Panel, Skeleton } from '../ui';

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  {
    id: 'orders',
    label: 'Orders',
    test: (r: ActivityRow) => r.type.startsWith('order.') || r.type === 'market.resolved',
  },
  { id: 'agent', label: 'Agent', test: (r: ActivityRow) => r.type.startsWith('agent.') },
  {
    id: 'blocked',
    label: 'Blocked',
    test: (r: ActivityRow) => r.status === 'blocked' || r.status === 'rejected',
  },
] as const;

const NODE = {
  accepted: { icon: CheckCircle2, color: 'var(--color-success)' },
  rejected: { icon: XCircle, color: 'var(--color-danger)' },
  blocked: { icon: ShieldX, color: 'var(--color-danger)' },
  info: { icon: Info, color: 'var(--color-steel)' },
} as const;

export function ActivityTimeline({ limit = 40 }: { limit?: number }) {
  const a = usePoll<ActivityRow[]>(`/activity?limit=${limit}`, 2000);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const rows = (a.data ?? []).filter(FILTERS.find((f) => f.id === filter)?.test ?? (() => true));
  return (
    <Panel
      title="Activity"
      icon={ActivityIcon}
      id="activity"
      flush
      actions={
        <div className="chips" role="group" aria-label="Filter activity">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="chip"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="count">{(a.data ?? []).filter(f.test).length}</span>
            </button>
          ))}
        </div>
      }
    >
      {a.error ? <ErrorState error={a.error} onRetry={a.refresh} /> : null}
      {a.loading ? (
        <div className="panel-body stack-sm">
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </div>
      ) : null}
      {a.data && rows.length === 0 ? <p className="panel-body muted">Nothing here yet.</p> : null}
      <ol className="timeline" data-testid="activity" style={{ maxHeight: 560, overflowY: 'auto' }}>
        {rows.map((r) => {
          const n = NODE[r.status];
          const Icon = r.type.startsWith('agent.') && r.status !== 'blocked' ? Bot : n.icon;
          return (
            <li key={r.event_id} className="timeline-item">
              <span className="timeline-node" style={{ color: n.color }}>
                <Icon size={14} aria-hidden="true" />
                <span className="visually-hidden">{r.status}</span>
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 'var(--text-sm)' }}>{r.summary}</p>
                <Link
                  href={`/dossier/?trace=${encodeURIComponent(r.correlation_id)}`}
                  className="label wrap-any"
                  style={{ textTransform: 'none', letterSpacing: 0 }}
                >
                  {r.type} · {r.correlation_id}
                </Link>
              </div>
              <span className="mono faint when" style={{ fontSize: 'var(--text-xs)' }}>
                {time(r.occurred_at)}
              </span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

const OWNERS = ['operator', 'agent-research', 'agent-reckless', 'agent-maker'];

function BalanceRow({ ownerId }: { ownerId: string }) {
  const p = usePoll<PortfolioDto>(`/portfolio/${ownerId}`, 2500);
  const v = p.data?.projection?.view;
  return (
    <tr data-testid={`portfolio-${ownerId}`}>
      <th scope="row" className="mono">
        {ownerId}
        <span className="faint" style={{ display: 'block', fontSize: 'var(--text-xs)' }}>
          {v?.positions.map((x) => `${x.quantity} ${x.outcome}`).join(' · ') || 'no positions'}
        </span>
      </th>
      <td className="num" data-testid={`available-${ownerId}`}>
        {p.error ? 'error' : credits(v?.available ?? (p.loading ? null : 0))}
      </td>
      <td className="num faint" data-testid={`reserved-${ownerId}`}>
        {credits(v?.reserved ?? (p.loading ? null : 0))}
      </td>
    </tr>
  );
}

export function Balances() {
  return (
    <Panel
      title="Paper balances"
      icon={Wallet}
      id="balances"
      flush
      actions={
        <Link className="link" href="/ledger/" style={{ fontSize: 'var(--text-sm)' }}>
          Journal →
        </Link>
      }
    >
      <div className="table-wrap">
        <table className="table">
          <caption className="visually-hidden">
            Paper credit balances by participant, from the ledger read model
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
            {OWNERS.map((o) => (
              <BalanceRow key={o} ownerId={o} />
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
