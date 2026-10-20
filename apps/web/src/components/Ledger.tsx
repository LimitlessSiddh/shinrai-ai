'use client';

import { credits, time, usePoll } from '@/lib/api';
import type { ActivityRow, PortfolioDto } from '@/lib/types';
import { DecisionStatus, ErrorState, Meta } from './ui';

const OWNERS = ['operator', 'agent-research', 'agent-reckless', 'agent-maker'];

function PortfolioRow({ ownerId }: { ownerId: string }) {
  const p = usePoll<PortfolioDto>(`/portfolio/${ownerId}`, 2500);
  const v = p.data?.projection?.view;
  const position = v?.positions.map((x) => `${x.quantity} ${x.outcome}`).join(', ');
  return (
    <tr data-testid={`portfolio-${ownerId}`}>
      <th scope="row" className="mono" style={{ textTransform: 'none', fontSize: 13 }}>
        {ownerId}
      </th>
      <td className="num" data-testid={`available-${ownerId}`}>
        {p.error ? 'error' : credits(v?.available ?? (p.loading ? null : 0))}
      </td>
      <td className="num" data-testid={`reserved-${ownerId}`}>
        {credits(v?.reserved ?? (p.loading ? null : 0))}
      </td>
      <td>{position || '—'}</td>
      <td className="num">{v?.openOrders.length ?? 0}</td>
    </tr>
  );
}

export function Portfolios() {
  return (
    <article className="card" aria-labelledby="pf-title">
      <h2 id="pf-title" className="h2">
        Paper balances
      </h2>
      <Meta>Read model · rebuilt from the double-entry ledger</Meta>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <caption className="visually-hidden">
            Paper credit balances and positions by participant
          </caption>
          <thead>
            <tr>
              <th scope="col">Participant</th>
              <th scope="col" style={{ textAlign: 'right' }}>
                Available
              </th>
              <th scope="col" style={{ textAlign: 'right' }}>
                Reserved
              </th>
              <th scope="col">Positions</th>
              <th scope="col" style={{ textAlign: 'right' }}>
                Open orders
              </th>
            </tr>
          </thead>
          <tbody>
            {OWNERS.map((o) => (
              <PortfolioRow key={o} ownerId={o} />
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function ActivityFeed({ limit = 12 }: { limit?: number }) {
  const a = usePoll<ActivityRow[]>(`/activity?limit=${limit}`, 2000);
  return (
    <article className="card" aria-labelledby="act-title">
      <h2 id="act-title" className="h2">
        Activity
      </h2>
      <Meta>Projected from immutable domain events</Meta>
      {a.error ? <ErrorState error={a.error} onRetry={a.refresh} /> : null}
      {a.data && a.data.length === 0 ? <p className="secondary">No events yet.</p> : null}
      <ol style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }} data-testid="activity">
        {(a.data ?? []).map((r) => (
          <li
            key={r.event_id}
            style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border-subtle)' }}
          >
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="meta">{time(r.occurred_at)}</span>
              <DecisionStatus value={r.status} />
            </div>
            <p style={{ marginTop: 4 }}>{r.summary}</p>
            <p className="meta" style={{ textTransform: 'none' }}>
              trace {r.correlation_id}
            </p>
          </li>
        ))}
      </ol>
    </article>
  );
}
