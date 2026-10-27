'use client';

import Link from 'next/link';
import { ArrowRight, Database, LoaderCircle, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { ActionPanel } from '@/components/market/ActionPanel';
import { ActivityTimeline, Balances } from '@/components/market/Activity';
import { DecisionStatus, Empty, ErrorState, LoadingPanel, Panel, Status } from '@/components/ui';
import { api, ApiFailure, percent } from '@/lib/api';
import { activeThesis, isOrderRequest, yesPrice } from '@/lib/derive';
import { useWorkspace } from '@/lib/workspace';

function WorkspaceHeader() {
  return (
    <header className="page-head">
      <div>
        <p className="label" style={{ color: 'var(--color-signal)' }}>
          Run workspace
        </p>
        <h1 className="page-title">NBA predictions</h1>
        <p className="page-desc">
          Inspect paper research records, evidence completeness, and policy outcomes.
        </p>
      </div>
      <div className="row">
        <span className="tag">Versioned local fixture</span>
        <Link className="btn btn-primary" href="/agents/">
          Configure agent <SlidersHorizontal size={16} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}

function SeedFixture() {
  const { fixture, refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const seed = async () => {
    if (!fixture) return;
    setBusy(true);
    try {
      await api(`/fixtures/${fixture.fixtureVersion}/seed`, { method: 'POST' });
      notify({
        tone: 'success',
        title: 'Research fixture prepared',
        detail: `${fixture.fixtureVersion} is ready for paper-only research.`,
      });
      refresh();
    } catch (error) {
      notify({
        tone: 'danger',
        title: error instanceof ApiFailure ? error.code : 'Setup failed',
        detail: error instanceof ApiFailure ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <WorkspaceHeader />
      <Panel>
        <Empty icon={Database} title="No research slate is available yet">
          <p className="muted" style={{ maxWidth: '52ch' }}>
            Prepare the versioned local NBA fixture to inspect its market, evidence, policy records,
            and paper-only runs. This creates no account or real-world transaction.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={seed}
            disabled={!fixture || busy}
          >
            {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : null}
            {busy ? 'Preparing…' : `Prepare ${fixture?.fixtureVersion ?? 'fixture'}`}
          </button>
        </Empty>
      </Panel>
    </div>
  );
}

export default function WorkspacePage() {
  const { marketId, marketsLoading, marketsError, detail, detailError, refresh } = useWorkspace();
  if (marketsError) return <ErrorState error={marketsError} onRetry={refresh} />;
  if (marketsLoading) return <LoadingPanel label="research slate" rows={5} />;
  if (!marketId) return <SeedFixture />;
  if (detailError) return <ErrorState error={detailError} onRetry={refresh} />;
  if (!detail) return <LoadingPanel label="selected market" rows={5} />;

  const market = detail.market;
  const thesis = activeThesis(detail.runs);
  const order = thesis && isOrderRequest(thesis.order_request) ? thesis.order_request : null;
  const marketProbability = yesPrice(detail);
  const evidenceCount = order
    ? detail.evidence.filter((item) => order.evidenceIds.includes(item.evidenceId)).length
    : 0;
  const noPrediction = detail.runs.find((run) => !run.conclusion && run.status === 'completed');

  return (
    <div className="stack settle" style={{ gap: 'var(--space-5)' }}>
      <WorkspaceHeader />
      <div className="research-layout">
        <div className="stack" style={{ gap: 'var(--space-5)' }}>
          <Panel
            title="Today’s slate"
            actions={
              <Status tone={market.status === 'open' ? 'success' : 'neutral'}>
                {market.status}
              </Status>
            }
            flush
          >
            <div className="workspace-note">
              <span>Agent probability remains separate from the market baseline.</span>
              <span className="label">{market.fixtureVersion}</span>
            </div>
            <div className="table-wrap">
              <table className="table workspace-table">
                <caption className="visually-hidden">NBA research slate</caption>
                <thead>
                  <tr>
                    <th>Game</th>
                    <th>Market</th>
                    <th>Prediction</th>
                    <th className="num">Agent</th>
                    <th className="num">Market</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="selected-row">
                    <th scope="row">
                      <strong>{market.awayTeam.name}</strong>
                      <span>{market.homeTeam.name}</span>
                    </th>
                    <td>{market.question}</td>
                    <td>
                      <strong>
                        {order ? `${order.outcome} · ${market.yesMeans}` : 'No prediction'}
                      </strong>
                    </td>
                    <td className="num">{order ? percent(order.probabilityYes, 0) : '—'}</td>
                    <td className="num">
                      {marketProbability === null ? '—' : `${marketProbability}%`}
                    </td>
                    <td>
                      <DecisionStatus
                        value={thesis?.policy_decision ?? (noPrediction ? 'info' : null)}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Latest run" actions={<span className="label">Recorded activity</span>}>
            <div className="run-summary">
              <span
                className={`dot${detail.runs.some((r) => r.status === 'running') ? '' : ' live'}`}
              />
              <p>
                <strong>
                  {detail.runs.some((r) => r.status === 'running')
                    ? 'Research in progress'
                    : 'Research record complete'}
                </strong>
                <span>
                  {detail.runs.length} run(s) recorded ·{' '}
                  {noPrediction
                    ? 'a no-prediction was held safely'
                    : 'evidence and policy are available for review'}
                </span>
              </p>
            </div>
          </Panel>
        </div>
        <aside className="panel research-detail" aria-label="Selected prediction">
          <span className="label">Selected prediction</span>
          <h2>
            {market.awayTeam.name} at {market.homeTeam.name}
          </h2>
          <DecisionStatus value={thesis?.policy_decision ?? (noPrediction ? 'info' : null)} />
          <p className="research-outcome" data-testid="workspace-outcome">
            {order ? `${order.outcome} · ${percent(order.probabilityYes, 0)}` : 'No prediction'}
          </p>
          <p className="muted">
            Market baseline {marketProbability === null ? 'unavailable' : `${marketProbability}%`}
          </p>
          <hr />
          <strong>Research status</strong>
          <p className="muted">
            {order
              ? `${evidenceCount} recorded evidence item(s) support the selected run.`
              : 'No eligible conclusion has been recorded for this market.'}
          </p>
          <Link
            className="btn btn-primary btn-block"
            href={thesis ? `/dossier/?run=${encodeURIComponent(thesis.run_id)}` : '/runs/'}
          >
            {thesis ? 'Open prediction detail' : 'Review run records'}{' '}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </aside>
      </div>
      <div className="grid cols-main">
        <ActionPanel detail={detail} />
        <div className="stack" style={{ gap: 'var(--space-5)' }}>
          <Balances />
          <ActivityTimeline limit={12} />
        </div>
      </div>
    </div>
  );
}
