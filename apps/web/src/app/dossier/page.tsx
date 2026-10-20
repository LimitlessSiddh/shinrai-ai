'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { activeThesis } from '@/components/MarketHero';
import { DecisionStatus, Empty, ErrorState, Loading, Meta, Status } from '@/components/ui';
import { credits, time, usePoll } from '@/lib/api';
import type { MarketDetail, MarketRow, OrderRequest, RunDetail, Trace } from '@/lib/types';

function evidenceRetrieved(trace: Trace): { evidenceId: string; title: string }[] {
  return trace.toolCalls
    .filter((c) => c.tool === 'searchEvidence' && c.ok)
    .flatMap((c) => (c.output as { items?: { evidenceId: string; title: string }[] })?.items ?? [])
    .filter((e, i, all) => all.findIndex((x) => x.evidenceId === e.evidenceId) === i);
}

function Steps({ d }: { d: RunDetail }) {
  const order = d.trace.toolCalls.filter((c) => c.tool === 'requestOrder').at(-1);
  const req = order?.input as Partial<OrderRequest> | undefined;
  const validReq = req && typeof req.price === 'number' && typeof req.quantity === 'number';
  const evidence = evidenceRetrieved(d.trace);
  const committed = d.trace.audit.find((a) => a.outcome === 'accepted');
  const decision = order?.policy_decision ?? null;
  const p = d.run.policy;
  const cost = validReq ? (req.price ?? 0) * (req.quantity ?? 0) : null;
  const current = committed ? 3 : order ? 2 : evidence.length ? 0 : 0;

  return (
    <ol className="steps section" aria-label="Decision steps">
      <li aria-current={current === 0 ? 'step' : undefined}>
        <Meta>01 / Inputs</Meta>
        <h2 className="h2" style={{ margin: '8px 0' }}>
          Evidence
        </h2>
        {evidence.length ? (
          <ul className="secondary" style={{ paddingLeft: 18 }}>
            {evidence.map((e) => (
              <li key={e.evidenceId}>
                {e.title} <span className="meta">{e.evidenceId}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="secondary">No evidence retrieved in this run.</p>
        )}
      </li>
      <li>
        <Meta>02 / Request</Meta>
        <h2 className="h2" style={{ margin: '8px 0' }}>
          The order
        </h2>
        {validReq ? (
          <>
            <p className="thesis" style={{ fontSize: 24 }}>
              BUY {req.outcome}
            </p>
            <p>
              {req.quantity} contracts @ {req.price}¢ · {credits(cost)} credits
            </p>
            {req.rationale ? <p className="secondary">“{req.rationale}”</p> : null}
          </>
        ) : order ? (
          <p className="secondary">
            Malformed request — rejected by the tool schema before policy.
          </p>
        ) : (
          <p className="secondary">This run did not request an order.</p>
        )}
      </li>
      <li aria-current={current === 2 ? 'step' : undefined}>
        <Meta>03 / Deterministic check</Meta>
        <h2 className="h2" style={{ margin: '8px 0' }}>
          Policy gate
        </h2>
        <p className="mono secondary">
          Budget: {credits(cost)} / {credits(p.budget)}
          <br />
          Size: {req?.quantity ?? '—'} / {p.maxOrderQuantity}
          <br />
          Scope: {p.marketScope.join(', ')}
          <br />
          Deadline: {p.runDeadlineSeconds}s
        </p>
        <div style={{ marginTop: 8 }}>
          <DecisionStatus value={decision} />
        </div>
        <ul className="secondary" style={{ paddingLeft: 18 }}>
          {(order?.reasons ?? []).map((r) => (
            <li key={r.code + r.message}>
              <span className="mono">{r.code}</span> — {r.message}
            </li>
          ))}
        </ul>
      </li>
      <li aria-current={current === 3 ? 'step' : undefined}>
        <Meta>04 / Result</Meta>
        <h2 className="h2" style={{ margin: '8px 0' }}>
          {committed ? 'Committed' : decision === 'approval_required' ? 'Held' : 'Not committed'}
        </h2>
        {committed ? (
          <>
            <p>
              One atomic write: order, {d.trace.ledger.length} ledger transaction(s), one event.
            </p>
            <DecisionStatus value="accepted" />
          </>
        ) : decision === 'approval_required' ? (
          <p className="secondary">Waiting for an operator decision on the Market page.</p>
        ) : (
          <>
            <p className="secondary">Zero orders, reservations or ledger entries were written.</p>
            {order ? <Status tone="danger">Blocked before the matching core</Status> : null}
          </>
        )}
      </li>
    </ol>
  );
}

function TraceTable({ trace }: { trace: Trace }) {
  type Row = { at: string; stage: string; what: string; status: string };
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
    })),
    ...trace.audit.map((a) => ({
      at: a.created_at,
      stage: 'Command',
      what: `${a.command_type} · ${a.policy.decision}`,
      status: a.outcome,
    })),
    ...trace.ledger.map((t) => ({
      at: t.created_at,
      stage: 'Ledger',
      what: `${t.reason}: ${t.entries
        .filter((e) => e.direction === 'debit')
        .map((e) => `${e.accountId} −${credits(e.amount)}`)
        .join('; ')}`,
      status: 'accepted',
    })),
    ...trace.events.map((e) => ({
      at: e.occurred_at,
      stage: 'Event',
      what: `${e.type} · ${e.published_at ? 'published' : 'in outbox'} · projected ${e.deliveries.length}×`,
      status: e.published_at ? 'accepted' : 'pending',
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div className="table-wrap">
      <table data-testid="trace-table">
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
              <td className="mono">{time(r.at)}</td>
              <td>{r.stage}</td>
              <td className="mono" style={{ fontSize: 13, wordBreak: 'break-word' }}>
                {r.what}
              </td>
              <td>
                <DecisionStatus value={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dossier() {
  const params = useSearchParams();
  const markets = usePoll<MarketRow[]>('/markets', 5000);
  const marketId = markets.data?.[0]?.market_id ?? null;
  const detail = usePoll<MarketDetail>(
    marketId ? `/markets/${encodeURIComponent(marketId)}` : null,
    3000,
  );
  const runId =
    params.get('run') ??
    (detail.data
      ? (activeThesis(detail.data.runs)?.run_id ?? detail.data.runs[0]?.run_id ?? null)
      : null);
  const run = usePoll<RunDetail>(runId ? `/runs/${encodeURIComponent(runId)}` : null, 2500);

  if (markets.error) return <ErrorState error={markets.error} onRetry={markets.refresh} />;
  if (run.error) return <ErrorState error={run.error} onRetry={run.refresh} />;
  if (markets.loading || (marketId && !detail.data)) return <Loading label="dossier" />;
  if (!runId) {
    return (
      <Empty title="No agent runs yet">
        <p className="secondary">Run an agent from the Market page to create a decision dossier.</p>
        <Link className="link" href="/">
          Go to the market →
        </Link>
      </Empty>
    );
  }
  if (!run.data) return <Loading label="run" />;
  const d = run.data;

  return (
    <>
      <Meta>Run {d.run.run_id} / immutable decision dossier</Meta>
      <h1 className="display" style={{ marginTop: 16, maxWidth: '16ch' }}>
        Before the market accepts an order,
      </h1>
      <p className="h2" style={{ color: 'var(--color-signal)', marginTop: 12, maxWidth: '36ch' }}>
        Shinrai asks whether the agent should be allowed to make it.
      </p>
      <div className="row section">
        <span className="mono">{d.run.agent_id}</span>
        <span className="secondary">{d.run.scenario}</span>
        <DecisionStatus value={d.run.status} />
        <span className="meta">model {d.run.model}</span>
      </div>
      <Steps d={d} />
      <section className="card section" aria-labelledby="trace-title">
        <Meta>The run, without mystery</Meta>
        <h2 id="trace-title" className="h2" style={{ margin: '8px 0 4px' }}>
          Evidence → proposal → policy → ledger → event
        </h2>
        <p className="meta" style={{ textTransform: 'none' }}>
          correlation {d.run.correlation_id} · the model never receives direct access to a balance,
          ledger, settlement or provider credential.
        </p>
        <TraceTable trace={d.trace} />
      </section>
      {detail.data ? (
        <section className="card section" aria-labelledby="runs-title">
          <h2 id="runs-title" className="h2">
            Other runs
          </h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {detail.data.runs.map((r) => (
              <li
                key={r.run_id}
                className="row"
                style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border-subtle)' }}
              >
                <Link
                  href={`/dossier/?run=${encodeURIComponent(r.run_id)}`}
                  aria-current={r.run_id === runId ? 'page' : undefined}
                >
                  {r.scenario}
                </Link>
                <span className="mono secondary">{r.agent_id}</span>
                <DecisionStatus value={r.policy_decision ?? r.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export default function DossierPage() {
  return (
    <Suspense fallback={<Loading label="dossier" />}>
      <Dossier />
    </Suspense>
  );
}
