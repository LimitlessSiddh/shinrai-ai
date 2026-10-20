'use client';

import Link from 'next/link';
import { Activity, ShieldX } from 'lucide-react';
import { useState } from 'react';
import {
  DecisionStatus,
  Empty,
  ErrorState,
  LoadingPanel,
  PageHeader,
  Panel,
  Stat,
} from '@/components/ui';
import { credits, time, usePoll } from '@/lib/api';
import { isOrderRequest, shortId } from '@/lib/derive';
import type { RunSummary } from '@/lib/types';

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'approved', label: 'Approved', test: (r: RunSummary) => r.policy_decision === 'approved' },
  {
    id: 'blocked',
    label: 'Blocked',
    test: (r: RunSummary) => r.policy_decision === 'blocked' || r.blocked_calls > 0,
  },
  { id: 'held', label: 'Awaiting approval', test: (r: RunSummary) => Boolean(r.pending_approval) },
] as const;

export default function RunsPage() {
  const runs = usePoll<RunSummary[]>('/runs?limit=100', 3000);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const all = runs.data ?? [];
  const rows = all.filter(FILTERS.find((f) => f.id === filter)?.test ?? (() => true));
  const blockedCalls = all.reduce((s, r) => s + r.blocked_calls, 0);

  return (
    <div className="stack settle" style={{ gap: 'var(--space-5)' }}>
      <PageHeader
        title="Agent runs"
        description="Every bounded run, the order it asked for and what deterministic policy decided. Open a run for its full decision dossier."
      />
      <div className="kpis">
        <Stat label="Runs" value={all.length} />
        <Stat
          label="Orders approved"
          value={all.filter((r) => r.policy_decision === 'approved').length}
        />
        <Stat
          label="Tool calls blocked"
          value={blockedCalls}
          hint="unsafe or out-of-policy requests"
        />
        <Stat label="Awaiting approval" value={all.filter((r) => r.pending_approval).length} />
      </div>
      {runs.error ? <ErrorState error={runs.error} onRetry={runs.refresh} /> : null}
      {runs.loading ? <LoadingPanel label="runs" /> : null}
      {runs.data ? (
        <Panel
          title="Run log"
          icon={Activity}
          id="runs"
          flush
          actions={
            <div className="chips" role="group" aria-label="Filter runs">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="chip"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span className="count">{all.filter(f.test).length}</span>
                </button>
              ))}
            </div>
          }
        >
          {rows.length === 0 ? (
            <Empty
              icon={Activity}
              title={all.length ? 'No runs match this filter' : 'No agent runs yet'}
            >
              {all.length ? null : (
                <Link className="link" href="/">
                  Run an agent from Overview →
                </Link>
              )}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table" data-testid="runs-table">
                <caption className="visually-hidden">
                  Agent runs, newest first. Select a scenario to open its dossier.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Scenario</th>
                    <th scope="col">Agent</th>
                    <th scope="col">Order request</th>
                    <th scope="col">Policy</th>
                    <th scope="col" className="num">
                      Tool calls
                    </th>
                    <th scope="col" className="num">
                      Started
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const req = isOrderRequest(r.order_request) ? r.order_request : null;
                    return (
                      <tr key={r.run_id} className="clickable">
                        <td>
                          <Link
                            className="row-link"
                            href={`/dossier/?run=${encodeURIComponent(r.run_id)}`}
                            style={{ fontWeight: 600 }}
                          >
                            {r.scenario}
                          </Link>
                          <span
                            className="label"
                            style={{ display: 'block', textTransform: 'none', letterSpacing: 0 }}
                          >
                            {shortId(r.run_id)} · {r.model}
                          </span>
                        </td>
                        <td className="mono">{r.agent_id}</td>
                        <td className="mono">
                          {req
                            ? `BUY ${req.outcome} ${req.quantity} @ ${req.price}¢ · ${credits(req.price * req.quantity)}`
                            : r.order_request
                              ? 'malformed'
                              : '—'}
                        </td>
                        <td>
                          <DecisionStatus
                            value={
                              r.pending_approval
                                ? 'pending'
                                : (r.policy_decision ?? (r.blocked_calls ? 'blocked' : null))
                            }
                          />
                        </td>
                        <td className="num">
                          {r.tool_calls}
                          {r.blocked_calls ? (
                            <span style={{ color: 'var(--color-danger)', marginLeft: 6 }}>
                              <ShieldX
                                size={12}
                                aria-hidden="true"
                                style={{ display: 'inline', verticalAlign: '-1px' }}
                              />{' '}
                              {r.blocked_calls}
                              <span className="visually-hidden"> blocked</span>
                            </span>
                          ) : null}
                        </td>
                        <td className="num faint">{time(r.started_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
