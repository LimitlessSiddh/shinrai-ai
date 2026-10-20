'use client';

import { useState } from 'react';
import {
  Announce,
  DecisionStatus,
  Empty,
  ErrorState,
  Loading,
  Meta,
  Status,
} from '@/components/ui';
import { api, ApiFailure, credits, percent, signedCredits, usePoll } from '@/lib/api';
import type { AgentReport, Evaluation, FixtureInfo } from '@/lib/types';

function CreditCurve({ report, agentId }: { report: AgentReport; agentId: string }) {
  const curve = report.equityCurve;
  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const span = Math.max(1, max - min);
  return (
    <figure style={{ margin: 0 }}>
      <div className="bars" aria-hidden="true">
        {curve.map((v, i) => (
          <div
            key={i}
            className={`bar${i === curve.length - 1 ? ' current' : ''}`}
            style={{ height: `${20 + ((v - min) / span) * 80}%` }}
            title={`Step ${i + 1}: ${credits(v)} credits`}
          />
        ))}
      </div>
      <figcaption className="meta" style={{ marginTop: 8 }}>
        {agentId} equity after each ledger transaction · final settlement highlighted
      </figcaption>
      <details style={{ marginTop: 12 }}>
        <summary className="link">Show data table</summary>
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Virtual credit curve for {agentId}</caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Equity (credits)
                </th>
              </tr>
            </thead>
            <tbody>
              {curve.map((v, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="num">{credits(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export default function ReplayPage() {
  const evals = usePoll<Evaluation[]>('/evaluations', 5000);
  const fixtures = usePoll<FixtureInfo[]>('/fixtures', 60_000);
  const [state, setState] = useState<'idle' | 'busy' | ApiFailure>('idle');
  const fixture = fixtures.data?.[0];

  const runAgain = async () => {
    if (!fixture) return;
    setState('busy');
    try {
      await api('/replays', { method: 'POST', body: { fixtureVersion: fixture.fixtureVersion } });
      setState('idle');
      evals.refresh();
    } catch (e) {
      setState(e instanceof ApiFailure ? e : new ApiFailure(0, 'UNKNOWN', String(e), null));
    }
  };

  const action = (
    <div className="row">
      <button
        type="button"
        className="btn btn-primary"
        onClick={runAgain}
        disabled={!fixture || state === 'busy'}
      >
        {state === 'busy'
          ? 'Replaying…'
          : evals.data?.length
            ? 'Run it again →'
            : 'Run the replay →'}
      </button>
      <Announce>
        {state instanceof ApiFailure ? (
          <Status tone="danger">{`${state.code}: ${state.message}`}</Status>
        ) : null}
      </Announce>
    </div>
  );

  if (evals.error) return <ErrorState error={evals.error} onRetry={evals.refresh} />;
  if (evals.loading) return <Loading label="evaluations" />;
  const latest = evals.data?.[0];
  if (!latest) {
    return (
      <Empty title="No replay yet">
        <p className="secondary">
          A replay runs the versioned fixture end to end in a fresh tenant and grades every agent.
        </p>
        {action}
      </Empty>
    );
  }

  const r = latest.report;
  const research = r.agents['agent-research'];
  const hashes = new Set(
    (evals.data ?? [])
      .filter((e) => e.fixture_version === latest.fixture_version)
      .map((e) => e.report_hash),
  );
  const replays = (evals.data ?? []).filter(
    (e) => e.fixture_version === latest.fixture_version,
  ).length;

  return (
    <>
      <section className="grid grid-hero" aria-labelledby="replay-title">
        <div className="stack" style={{ gap: 20 }}>
          <Meta>Fixture replay / {latest.fixture_version}</Meta>
          <h1 id="replay-title" className="display">
            The proof is in the replay.
          </h1>
          <p className="lede">
            A result is interesting. A result you can reproduce is engineering.
          </p>
          <p className="secondary">
            {r.question} Resolved {r.resolution.winningOutcome} ({r.resolution.finalScore}).
          </p>
        </div>
        {research ? (
          <article className="card selected" aria-labelledby="eval-title">
            <Meta>Agent evaluation · agent-research</Meta>
            <h2 id="eval-title" className="visually-hidden">
              Research agent evaluation
            </h2>
            <div className="grid grid-2" style={{ marginTop: 12 }}>
              <div>
                <p className="value-xl mono" data-testid="brier">
                  {research.brierScore?.toFixed(2) ?? '—'}
                </p>
                <Meta>Brier score (lower is better)</Meta>
              </div>
              <div>
                <p className="value-xl mono" data-testid="adherence">
                  {percent(research.policyAdherence, 0)}
                </p>
                <Meta>Policy adherence</Meta>
              </div>
            </div>
            <hr className="divider" />
            <p className="row">
              {hashes.size === 1 ? (
                <Status tone="success">Reproduced</Status>
              ) : (
                <Status tone="warning">Hash drift</Status>
              )}
              <span>
                Same fixture. Same policy. Same ledger output. {replays} replay
                {replays === 1 ? '' : 's'}, {hashes.size} distinct report hash
                {hashes.size === 1 ? '' : 'es'}.
              </span>
            </p>
            <p className="meta" style={{ textTransform: 'none' }}>
              report {latest.report_hash} · ledger {r.ledger.fingerprint} ({r.ledger.transactions}{' '}
              transactions)
            </p>
          </article>
        ) : null}
      </section>

      {research ? (
        <section className="card section grid grid-hero" aria-labelledby="curve-title">
          <div className="stack">
            <Meta>Virtual credit curve</Meta>
            <h2 id="curve-title" className="h2">
              {research.paperPnl >= 0
                ? 'The agent got sharper without getting reckless.'
                : 'The agent lost paper credits within policy.'}
            </h2>
            <div className="grid grid-2">
              <div>
                <Meta>Return</Meta>
                <p className="value-lg mono" data-testid="pnl">
                  {signedCredits(research.paperPnl)}
                </p>
                <Meta>virtual credits · start {credits(research.startingCredits)}</Meta>
              </div>
              <div>
                <Meta>Max drawdown</Meta>
                <p className="value-lg mono">{percent(research.maxDrawdown)}</p>
                <Meta>log loss {research.logLoss?.toFixed(3) ?? '—'}</Meta>
              </div>
            </div>
          </div>
          <CreditCurve report={research} agentId="agent-research" />
        </section>
      ) : null}

      <section className="card section" aria-labelledby="agents-title">
        <h2 id="agents-title" className="h2">
          Every agent, graded the same way
        </h2>
        <div className="table-wrap">
          <table data-testid="agents-table">
            <caption className="visually-hidden">Evaluation metrics per agent</caption>
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Brier
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Log loss
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Paper PnL
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Drawdown
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Tool success
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Violations
                </th>
                <th scope="col">Policy</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(r.agents).map(([id, a]) => (
                <tr key={id}>
                  <th scope="row" className="mono" style={{ textTransform: 'none', fontSize: 13 }}>
                    {id}
                  </th>
                  <td className="num">{a.brierScore?.toFixed(4) ?? '—'}</td>
                  <td className="num">{a.logLoss?.toFixed(4) ?? '—'}</td>
                  <td className="num">{signedCredits(a.paperPnl)}</td>
                  <td className="num">{percent(a.maxDrawdown)}</td>
                  <td className="num">{percent(a.toolCallSuccessRate, 0)}</td>
                  <td className="num">{a.policyViolations}</td>
                  <td>
                    {a.policyViolations === 0 ? (
                      <DecisionStatus value="approved" />
                    ) : (
                      <DecisionStatus value="blocked" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="banner section row"
        style={{ justifyContent: 'space-between' }}
        aria-label="Replay actions"
      >
        <span className="meta">
          Replay complete / tenant {latest.replay_tenant} / trace {latest.correlation_id}
        </span>
        {action}
      </section>
    </>
  );
}
