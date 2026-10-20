'use client';

import { ArrowRight, Inbox, Network, ServerCog, ShieldCheck } from 'lucide-react';
import { Empty, ErrorState, LoadingPanel, PageHeader, Panel, Stat, Status } from '@/components/ui';
import { time } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

export default function SystemPage() {
  const { system: s, systemError, refresh } = useWorkspace();
  if (systemError) return <ErrorState error={systemError} onRetry={refresh} />;
  if (!s) return <LoadingPanel label="system status" />;

  const flow = [
    {
      title: 'Command',
      value: s.commands,
      hint: `${s.rejected} rejected`,
      tone: 'neutral' as const,
    },
    {
      title: 'Outbox',
      value: s.events,
      hint: `${s.unpublished} unpublished`,
      tone: s.unpublished ? ('warning' as const) : ('success' as const),
    },
    {
      title: 'JetStream',
      value: s.events - s.unpublished,
      hint: 'published',
      tone: 'neutral' as const,
    },
    {
      title: 'Projector',
      value: s.events - s.unprojected,
      hint: `${s.unprojected} behind`,
      tone: s.unprojected ? ('warning' as const) : ('success' as const),
    },
    {
      title: 'Read models',
      value: s.deadLetters.length ? 'degraded' : 'current',
      hint: `last ${time(s.last_projected_at)}`,
      tone: s.deadLetters.length ? ('danger' as const) : ('success' as const),
    },
  ];

  return (
    <div className="stack settle" style={{ gap: 'var(--space-5)' }}>
      <PageHeader
        title="System"
        description="PostgreSQL facts are authoritative; dashboard read models are projected asynchronously and may lag. This page shows how far."
        actions={<Status tone="neutral" icon={ShieldCheck}>{`${s.profile} · ${s.model}`}</Status>}
      />
      <div className="kpis">
        <Stat label="Events" value={s.events} hint={`last ${time(s.last_event_at)}`} />
        <Stat
          label="Outbox backlog"
          value={s.unpublished}
          hint="committed, not yet published"
          testId="outbox-backlog"
        />
        <Stat
          label="Projection lag"
          value={s.unprojected}
          hint="published, not yet projected"
          testId="projection-lag"
        />
        <Stat
          label="Ledger transactions"
          value={s.ledger_transactions}
          hint="balanced, append-only"
        />
        <Stat label="Dead letters" value={s.deadLetters.length} hint="exhausted retries" />
      </div>

      <Panel title="Event pipeline" icon={Network} id="pipeline">
        <ol className="flow" aria-label="Event pipeline stages">
          {flow.map((f, i) => (
            <li key={f.title} className="flow-node">
              <span className="row between">
                <span className="label">
                  0{i + 1} · {f.title}
                </span>
                {i < flow.length - 1 ? (
                  <ArrowRight size={14} className="faint" aria-hidden="true" />
                ) : null}
              </span>
              <span className="stat-value">{f.value}</span>
              <span>
                <Status tone={f.tone}>{f.hint}</Status>
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid cols-2">
        <Panel title="Dead letters" icon={Inbox} id="dlq" flush>
          {s.deadLetters.length === 0 ? (
            <Empty icon={Inbox} title="No dead letters">
              <p className="muted">
                Failed projections are retried with backoff; only exhausted events land here.
              </p>
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="visually-hidden">
                  Events that exhausted their retry budget
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col" className="num">
                      Attempts
                    </th>
                    <th scope="col">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {s.deadLetters.map((d) => (
                    <tr key={d.event_id}>
                      <td className="mono wrap-any" style={{ fontSize: 'var(--text-xs)' }}>
                        {d.event_id}
                      </td>
                      <td className="num">{d.attempts}</td>
                      <td className="muted">{d.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Guarantees" icon={ServerCog} id="guarantees">
          <ul className="stack-sm">
            {[
              'SERIALIZABLE command transactions with a per-market advisory lock and sorted account locks',
              'Exactly one outbox event per command, committed atomically with its facts',
              'Idempotency keys return the original result; settlement happens once per market',
              'Ledger rows are append-only; unbalanced transactions are rejected at commit',
              'Consumers dedupe by event id, so redelivery never double-applies a projection',
            ].map((g) => (
              <li
                key={g}
                className="row"
                style={{ alignItems: 'flex-start', gap: 10, flexWrap: 'nowrap' }}
              >
                <ShieldCheck
                  size={16}
                  style={{ color: 'var(--color-success)', marginTop: 3, flex: 'none' }}
                  aria-hidden="true"
                />
                <span className="muted">{g}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
