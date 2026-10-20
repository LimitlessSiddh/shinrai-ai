'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  FileSearch,
  Gauge,
  Landmark,
  ListTree,
  Radio,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { Suspense } from 'react';
import { DecisionStatus, Empty, ErrorState, LoadingPanel, Panel, Status } from '@/components/ui';
import { credits, time, usePoll } from '@/lib/api';
import { isOrderRequest } from '@/lib/derive';
import type { AgentPolicy } from '@shinrai/contracts';
import type { RunDetail, Trace } from '@/lib/types';
import { useWorkspace } from '@/lib/workspace';

type StageState = 'done' | 'blocked' | 'held' | 'skipped';
type Stage = { key: string; title: string; icon: typeof Radio; state: StageState; detail: string };
type EvidenceItem = {
  evidenceId: string;
  title: string;
  source: string;
  stance: string;
  summary: string;
};

function retrievedEvidence(trace: Trace): EvidenceItem[] {
  return trace.toolCalls
    .filter((c) => c.tool === 'searchEvidence' && c.ok)
    .flatMap((c) => (c.output as { items?: EvidenceItem[] })?.items ?? [])
    .filter((e, i, all) => all.findIndex((x) => x.evidenceId === e.evidenceId) === i);
}

function stagesFor(trace: Trace): Stage[] {
  const evidence = retrievedEvidence(trace);
  const order = trace.toolCalls.filter((c) => c.tool === 'requestOrder').at(-1);
  const decision =
    order?.policy_decision ?? (trace.audit[0] ? trace.audit[0].policy.decision : null);
  const valid = order ? isOrderRequest(order.input) : Boolean(trace.audit.length);
  const committed = trace.audit.some((a) => a.outcome === 'accepted');
  const published = trace.events.filter((e) => e.published_at).length;
  const proposed = Boolean(order || trace.audit.length);
  return [
    {
      key: 'evidence',
      title: 'Evidence',
      icon: BookOpen,
      state: evidence.length ? 'done' : 'skipped',
      detail: `${evidence.length} item(s) retrieved`,
    },
    {
      key: 'proposal',
      title: 'Proposal',
      icon: FileSearch,
      state: !proposed ? 'skipped' : valid ? 'done' : 'blocked',
      detail: !proposed
        ? 'no order requested'
        : valid
          ? 'well-formed request'
          : 'rejected by tool schema',
    },
    {
      key: 'policy',
      title: 'Policy gate',
      icon: Scale,
      state:
        decision === 'approved'
          ? 'done'
          : decision === 'blocked'
            ? 'blocked'
            : decision === 'approval_required'
              ? 'held'
              : 'skipped',
      detail: decision === 'approval_required' ? 'held for a human' : (decision ?? 'not reached'),
    },
    {
      key: 'ledger',
      title: 'Ledger',
      icon: Landmark,
      state: committed ? 'done' : 'skipped',
      detail: committed ? `${trace.ledger.length} balanced transaction(s)` : 'nothing written',
    },
    {
      key: 'event',
      title: 'Events',
      icon: Radio,
      state: published ? 'done' : 'skipped',
      detail: `${published}/${trace.events.length} published`,
    },
  ];
}

function Pipeline({ trace }: { trace: Trace }) {
  const stages = stagesFor(trace);
  const decisive = stages.findIndex((s) => s.state === 'blocked' || s.state === 'held');
  const current = decisive >= 0 ? decisive : stages.map((s) => s.state).lastIndexOf('done');
  return (
    <ol className="pipeline panel" aria-label="Decision pipeline">
      {stages.map((s, i) => {
        const Icon = s.icon;
        return (
          <li
            key={s.key}
            className="stage"
            data-state={s.state}
            data-current={i === current}
            aria-current={i === current ? 'step' : undefined}
          >
            <span className="stage-index">0{i + 1}</span>
            <span className="row" style={{ gap: 8 }}>
              <Icon size={16} aria-hidden="true" style={{ color: 'var(--color-steel)' }} />
              <span className="stage-title">{s.title}</span>
            </span>
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              {s.detail}
            </span>
            <span>
              {s.state === 'done' ? <Status tone="success">Passed</Status> : null}
              {s.state === 'blocked' ? <DecisionStatus value="blocked" /> : null}
              {s.state === 'held' ? <DecisionStatus value="pending" /> : null}
              {s.state === 'skipped' ? <Status tone="neutral">Not reached</Status> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Meter({
  label,
  used,
  limit,
  format = (n: number) => String(n),
}: {
  label: string;
  used: number | null;
  limit: number;
  format?: (n: number) => string;
}) {
  const pct = used === null ? 0 : Math.min(100, (used / Math.max(1, limit)) * 100);
  const over = used !== null && used > limit;
  const text = `${used === null ? '—' : format(used)} / ${format(limit)}${over ? ' · over limit' : ''}`;
  return (
    <div className="stack-sm" style={{ gap: 6 }}>
      <div className="row between">
        <span className="label">{label}</span>
        <span
          className="mono"
          style={{ fontSize: 'var(--text-sm)', color: over ? 'var(--color-danger)' : undefined }}
        >
          {text}
        </span>
      </div>
      <div className={`meter${over ? ' over' : ''}`} role="img" aria-label={`${label}: ${text}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PolicyGate({ trace, policy }: { trace: Trace; policy: AgentPolicy | null }) {
  const order = trace.toolCalls.filter((c) => c.tool === 'requestOrder').at(-1);
  const req = order && isOrderRequest(order.input) ? order.input : null;
  const reasons = order?.reasons ?? trace.audit[0]?.policy.reasons ?? [];
  return (
    <Panel
      title="Policy gate"
      icon={ShieldCheck}
      id="policy"
      actions={<DecisionStatus value={order?.policy_decision ?? trace.audit[0]?.policy.decision} />}
    >
      {policy ? (
        <div className="stack">
          <Meter
            label="Run budget"
            used={req ? req.price * req.quantity : null}
            limit={policy.budget}
            format={(n) => credits(n)}
          />
          <Meter
            label="Order size"
            used={req ? req.quantity : null}
            limit={policy.maxOrderQuantity}
          />
          <dl className="grid cols-2" style={{ gap: 'var(--space-3)' }}>
            <div>
              <dt className="label">Market scope</dt>
              <dd className="mono wrap-any" style={{ fontSize: 'var(--text-sm)' }}>
                {policy.marketScope.join(', ')}
              </dd>
            </div>
            <div>
              <dt className="label">Deadline · approval</dt>
              <dd className="mono" style={{ fontSize: 'var(--text-sm)' }}>
                {policy.runDeadlineSeconds}s ·{' '}
                {policy.approvalThreshold === null
                  ? 'none'
                  : `> ${credits(policy.approvalThreshold)}`}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="muted">Human command: authorized by scope; no agent policy applies.</p>
      )}
      {reasons.length ? (
        <ul className="stack-sm" style={{ marginTop: 'var(--space-4)' }}>
          {reasons.map((r) => (
            <li
              key={r.code + r.message}
              className="callout"
              style={{ padding: 'var(--space-2) var(--space-3)' }}
            >
              <span>
                <strong className="mono" style={{ fontSize: 'var(--text-xs)' }}>
                  {r.code}
                </strong>
                <span className="muted" style={{ display: 'block' }}>
                  {r.message}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

function EvidencePanel({ trace }: { trace: Trace }) {
  const order = trace.toolCalls.filter((c) => c.tool === 'requestOrder').at(-1);
  const cited = order && isOrderRequest(order.input) ? order.input.evidenceIds : [];
  const items = retrievedEvidence(trace);
  return (
    <Panel
      title="Evidence"
      icon={BookOpen}
      id="evidence"
      actions={<span className="label">{items.length} retrieved</span>}
    >
      {items.length === 0 ? (
        <p className="muted">No evidence was retrieved in this run.</p>
      ) : (
        <ul className="stack-sm">
          {items.map((e) => (
            <li key={e.evidenceId} className="callout" style={{ display: 'grid', gap: 4 }}>
              <span className="row between">
                <strong>{e.title}</strong>
                {cited.includes(e.evidenceId) ? <Status tone="signal">Cited</Status> : null}
              </span>
              <span className="muted">{e.summary}</span>
              <span className="label">
                {e.source} · {e.stance.replace('_', ' ')} · {e.evidenceId}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function LedgerImpact({ trace }: { trace: Trace }) {
  return (
    <Panel
      title="Ledger impact"
      icon={Landmark}
      id="ledger-impact"
      flush
      actions={<span className="label">debits = credits</span>}
    >
      {trace.ledger.length === 0 ? (
        <Empty icon={Landmark} title="Zero orders, reservations or ledger entries were written." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">
              Balanced ledger postings written by this command
            </caption>
            <thead>
              <tr>
                <th scope="col">Transaction</th>
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
              {trace.ledger.flatMap((t) =>
                t.entries.map((e, i) => (
                  <tr
                    key={`${t.tx_id}-${e.entryNo}`}
                    className={`journal-entry${i === 0 ? ' first' : ''}`}
                  >
                    <td className="mono">{i === 0 ? t.reason : ''}</td>
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
  );
}

function TraceLog({ trace }: { trace: Trace }) {
  type Row = { at: string; stage: string; what: string; status: string; payload?: unknown };
  const rows: Row[] = [
    ...trace.toolCalls.map((c) => ({
      at: c.created_at,
      stage: 'Tool call',
      what: `${c.seq}. ${c.tool}`,
      status: c.ok
        ? c.policy_decision === 'not_applicable'
          ? 'completed'
          : (c.policy_decision ?? 'completed')
        : c.policy_decision === 'blocked'
          ? 'blocked'
          : 'rejected',
      payload: { input: c.input, output: c.output, reasons: c.reasons },
    })),
    ...trace.audit.map((a) => ({
      at: a.created_at,
      stage: 'Command',
      what: `${a.command_type} · ${a.policy.decision}`,
      status: a.outcome,
      payload: a.policy,
    })),
    ...trace.ledger.map((t) => ({
      at: t.created_at,
      stage: 'Ledger',
      what: `${t.reason} · ${t.entries.length} entries`,
      status: 'accepted',
      payload: t.entries,
    })),
    ...trace.events.map((e) => ({
      at: e.occurred_at,
      stage: 'Event',
      what: `${e.type} · ${e.published_at ? 'published' : 'in outbox'} · projected ${e.deliveries.length}×`,
      status: e.published_at ? 'accepted' : 'pending',
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <Panel title="Evidence → proposal → policy → ledger → event" icon={ListTree} id="trace" flush>
      <p
        className="label wrap-any"
        style={{
          padding: 'var(--space-3) var(--space-5) 0',
          textTransform: 'none',
          letterSpacing: 0,
        }}
      >
        correlation {trace.correlationId} · the model never touches a balance, ledger, settlement or
        provider credential
      </p>
      <div className="table-wrap">
        <table className="table" data-testid="trace-table">
          <caption className="visually-hidden">
            Every record written under correlation id {trace.correlationId}
          </caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Stage</th>
              <th scope="col">Record</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="mono faint">{time(r.at)}</td>
                <td>{r.stage}</td>
                <td className="mono wrap-any" style={{ fontSize: 'var(--text-sm)' }}>
                  {r.payload ? (
                    <details className="payload">
                      <summary>{r.what}</summary>
                      <pre>{JSON.stringify(r.payload, null, 2)}</pre>
                    </details>
                  ) : (
                    r.what
                  )}
                </td>
                <td>
                  <DecisionStatus value={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Dossier() {
  const params = useSearchParams();
  const { detail } = useWorkspace();
  const traceParam = params.get('trace');
  const trace = usePoll<Trace>(
    traceParam ? `/trace/${encodeURIComponent(traceParam)}` : null,
    3000,
  );
  const fallbackRun =
    detail?.runs.find((r) => isOrderRequest(r.order_request))?.run_id ??
    detail?.runs[0]?.run_id ??
    null;
  const runId =
    params.get('run') ?? trace.data?.runs[0]?.run_id ?? (traceParam ? null : fallbackRun);
  const run = usePoll<RunDetail>(runId ? `/runs/${encodeURIComponent(runId)}` : null, 2500);

  const back = (
    <Link className="link" href="/runs/" style={{ fontSize: 'var(--text-sm)' }}>
      <ArrowLeft size={14} aria-hidden="true" /> All runs
    </Link>
  );
  if (run.error) return <ErrorState error={run.error} onRetry={run.refresh} />;
  if (trace.error) return <ErrorState error={trace.error} onRetry={trace.refresh} />;

  // A command trace with no agent run (for example a human order).
  if (traceParam && trace.data && !trace.data.runs.length) {
    const t = trace.data;
    return (
      <div className="stack settle" style={{ gap: 'var(--space-5)' }}>
        {back}
        <div className="page-head">
          <div>
            <p className="label">Command trace</p>
            <h1 className="page-title">{t.audit[0]?.command_type ?? 'Trace'}</h1>
            <p className="page-desc mono wrap-any">{t.correlationId}</p>
          </div>
          <DecisionStatus value={t.audit[0]?.outcome} />
        </div>
        <Pipeline trace={t} />
        <div className="grid cols-2">
          <PolicyGate trace={t} policy={null} />
          <LedgerImpact trace={t} />
        </div>
        <TraceLog trace={t} />
      </div>
    );
  }

  if (!runId) {
    if (traceParam || !detail) return <LoadingPanel label="dossier" />;
    return (
      <div className="panel">
        <Empty icon={Gauge} title="No agent runs yet">
          <p className="muted">Run an agent from Overview to create a decision dossier.</p>
          <Link className="link" href="/">
            Go to Overview →
          </Link>
        </Empty>
      </div>
    );
  }
  if (!run.data) return <LoadingPanel label="run" rows={6} />;
  const d = run.data;

  return (
    <div className="stack settle" style={{ gap: 'var(--space-5)' }}>
      {back}
      <div className="page-head">
        <div>
          <p className="label">Immutable decision dossier · {d.run.agent_id}</p>
          <h1 className="page-title">{d.run.scenario}</h1>
          <p className="page-desc">
            Before the market accepts an order, Shinrai asks whether the agent should be allowed to
            make it.
          </p>
        </div>
        <div className="row">
          <span className="tag">{d.run.model}</span>
          <span className="tag wrap-any">{d.run.run_id}</span>
          <DecisionStatus value={d.run.status} />
        </div>
      </div>
      {d.approvals.some((a) => a.status === 'pending') ? (
        <p className="callout warning">
          This order is held for a human decision. Approve or reject it from Overview.
        </p>
      ) : null}
      <Pipeline trace={d.trace} />
      <div className="grid cols-2">
        <PolicyGate trace={d.trace} policy={d.run.policy} />
        <EvidencePanel trace={d.trace} />
      </div>
      <LedgerImpact trace={d.trace} />
      <TraceLog trace={d.trace} />
    </div>
  );
}

export default function DossierPage() {
  return (
    <Suspense fallback={<LoadingPanel label="dossier" />}>
      <Dossier />
    </Suspense>
  );
}
