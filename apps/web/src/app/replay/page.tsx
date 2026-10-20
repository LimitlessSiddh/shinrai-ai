'use client';

import {
  CheckCircle2,
  Fingerprint,
  History,
  LineChart,
  LoaderCircle,
  Play,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import {
  DecisionStatus,
  Empty,
  ErrorState,
  LoadingPanel,
  PageHeader,
  Panel,
  Stat,
  Status,
} from '@/components/ui';
import { api, ApiFailure, credits, percent, signedCredits, time, usePoll } from '@/lib/api';
import type { AgentReport, Evaluation } from '@/lib/types';
import { useWorkspace } from '@/lib/workspace';

/** Step chart of agent equity after each ledger transaction. Steel line; the final settlement point is the signal. */
function EquityChart({ report, agentId }: { report: AgentReport; agentId: string }) {
  const curve = report.equityCurve;
  const W = 960;
  const H = 260;
  const pad = { l: 72, r: 16, t: 16, b: 32 };
  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const lo = min === max ? min - 100 : min - (max - min) * 0.1;
  const hi = min === max ? max + 100 : max + (max - min) * 0.1;
  const x = (i: number) =>
    pad.l +
    (curve.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (curve.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const path = curve.map((v, i) => (i === 0 ? `M${x(i)},${y(v)}` : `H${x(i)}V${y(v)}`)).join('');
  const ticks = [lo, (lo + hi) / 2, hi];
  const summary = `${agentId} equity went from ${credits(curve[0] ?? 0)} to ${credits(curve.at(-1) ?? 0)} credits over ${curve.length} ledger steps.`;

  return (
    <figure className="chart stack-sm">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-border-subtle)"
              strokeDasharray="2 4"
            />
            <text x={pad.l - 10} y={y(t) + 4} textAnchor="end">
              {credits(Math.round(t))}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--color-steel)" strokeWidth="2" />
        {curve.map((v, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(v)}
            r={i === curve.length - 1 ? 6 : 3.5}
            fill={i === curve.length - 1 ? 'var(--color-signal)' : 'var(--color-surface-raised)'}
            stroke={i === curve.length - 1 ? 'var(--color-signal)' : 'var(--color-steel)'}
            strokeWidth="1.5"
          >
            <title>{`Step ${i + 1}: ${credits(v)} credits`}</title>
          </circle>
        ))}
        {curve.map((_, i) => (
          <text key={`x${i}`} x={x(i)} y={H - 10} textAnchor="middle">
            {i + 1}
          </text>
        ))}
      </svg>
      <figcaption className="label" style={{ textTransform: 'none', letterSpacing: 0 }}>
        Equity at cost after each ledger transaction (x = step). Signal marks the final, settled
        value.
      </figcaption>
      <details className="payload">
        <summary className="link" style={{ fontSize: 'var(--text-sm)' }}>
          Show data table
        </summary>
        <table className="table" style={{ marginTop: 8 }}>
          <caption className="visually-hidden">Virtual credit curve for {agentId}</caption>
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col" className="num">
                Equity (credits)
              </th>
            </tr>
          </thead>
          <tbody>
            {curve.map((v, i) => (
              <tr key={i}>
                <td className="mono">{i + 1}</td>
                <td className="num">{credits(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export default function ReplayPage() {
  const evals = usePoll<Evaluation[]>('/evaluations', 5000);
  const { fixture, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [agent, setAgent] = useState('agent-research');

  const run = async () => {
    if (!fixture) return;
    setBusy(true);
    try {
      const r = await api<{ hash: string; evaluationId: string }>('/replays', {
        method: 'POST',
        body: { fixtureVersion: fixture.fixtureVersion },
      });
      notify({
        tone: 'success',
        title: 'Replay complete',
        detail: `report ${r.data.hash} · ${r.data.evaluationId}`,
      });
      evals.refresh();
    } catch (e) {
      notify({
        tone: 'danger',
        title: e instanceof ApiFailure ? e.code : 'Replay failed',
        detail: e instanceof ApiFailure ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const latest = evals.data?.[0];
  const action = (
    <button type="button" className="btn btn-primary" onClick={run} disabled={!fixture || busy}>
      {busy ? (
        <LoaderCircle size={16} className="spin" aria-hidden="true" />
      ) : (
        <Play size={16} aria-hidden="true" />
      )}
      {busy ? 'Replaying…' : latest ? 'Run it again' : 'Run the replay'}
    </button>
  );
  const header = (
    <PageHeader
      title="Replay proof"
      description="Replays the versioned fixture end to end in a fresh tenant, through the real command path, and grades every agent. Same fixture, same policy, same ledger output."
      actions={action}
    />
  );

  if (evals.error) return <ErrorState error={evals.error} onRetry={evals.refresh} />;
  if (evals.loading) return <LoadingPanel label="evaluations" />;
  if (!latest) {
    return (
      <div className="stack">
        {header}
        <div className="panel">
          <Empty icon={History} title="No replay yet">
            <p className="muted">Run the replay to produce the first evaluation report.</p>
          </Empty>
        </div>
      </div>
    );
  }

  const r = latest.report;
  const agents = Object.keys(r.agents);
  const selected = r.agents[agent] ?? r.agents[agents[0] ?? ''];
  const history = (evals.data ?? []).filter((e) => e.fixture_version === latest.fixture_version);
  const distinct = new Set(history.map((e) => e.report_hash)).size;

  return (
    <div className="stack settle" style={{ gap: 'var(--space-5)' }}>
      {header}
      <div className="callout" style={{ alignItems: 'center' }}>
        {distinct === 1 ? (
          <Status tone="success" icon={CheckCircle2}>
            Reproduced
          </Status>
        ) : (
          <Status tone="warning">Hash drift</Status>
        )}
        <span>
          <strong data-testid="reproduced">
            {history.length} replay{history.length === 1 ? '' : 's'}, {distinct} distinct report
            hash{distinct === 1 ? '' : 'es'}
          </strong>
          <span className="muted">
            {' '}
            · {r.question} Resolved {r.resolution.winningOutcome} ({r.resolution.finalScore}).
          </span>
        </span>
      </div>

      <div className="tabs" role="group" aria-label="Agent" style={{ maxWidth: 420 }}>
        {agents.map((a) => (
          <button
            key={a}
            type="button"
            className="tab"
            aria-pressed={a === agent}
            onClick={() => setAgent(a)}
          >
            {a}
          </button>
        ))}
      </div>

      {selected ? (
        <>
          <div className="kpis">
            <Stat
              label="Brier score"
              value={selected.brierScore?.toFixed(4) ?? '—'}
              hint="lower is better"
              testId="brier"
            />
            <Stat label="Log loss" value={selected.logLoss?.toFixed(4) ?? '—'} />
            <Stat
              label="Paper PnL"
              value={signedCredits(selected.paperPnl)}
              hint={`from ${credits(selected.startingCredits)}`}
              testId="pnl"
            />
            <Stat label="Max drawdown" value={percent(selected.maxDrawdown)} />
            <Stat
              label="Policy adherence"
              value={percent(selected.policyAdherence, 0)}
              hint={`${selected.policyViolations} violation(s)`}
              testId="adherence"
            />
            <Stat label="Tool success" value={percent(selected.toolCallSuccessRate, 0)} />
          </div>
          <Panel
            title="Virtual credit curve"
            icon={LineChart}
            id="curve"
            actions={<span className="label">{agent}</span>}
          >
            <EquityChart report={selected} agentId={agent} />
          </Panel>
        </>
      ) : null}

      <div className="grid cols-2">
        <Panel title="Every agent, graded the same way" icon={Users} id="agents" flush>
          <div className="table-wrap">
            <table className="table" data-testid="agents-table">
              <caption className="visually-hidden">Evaluation metrics per agent</caption>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col" className="num">
                    Brier
                  </th>
                  <th scope="col" className="num">
                    PnL
                  </th>
                  <th scope="col" className="num">
                    Violations
                  </th>
                  <th scope="col">Policy</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(r.agents).map(([id, a]) => (
                  <tr key={id}>
                    <th scope="row" className="mono" style={{ fontWeight: 500 }}>
                      {id}
                    </th>
                    <td className="num">{a.brierScore?.toFixed(4) ?? '—'}</td>
                    <td className="num">{signedCredits(a.paperPnl)}</td>
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
        </Panel>
        <Panel title="Replay history" icon={Fingerprint} id="history" flush>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">
                Previous replays of this fixture and their report hashes
              </caption>
              <thead>
                <tr>
                  <th scope="col">Replay</th>
                  <th scope="col">Report hash</th>
                  <th scope="col">Ledger</th>
                  <th scope="col" className="num">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.evaluation_id}>
                    <td className="mono" style={{ fontSize: 'var(--text-xs)' }}>
                      {e.replay_tenant.replace(`replay-${e.fixture_version}-`, '#')}
                    </td>
                    <td className="mono">
                      {e.report_hash}
                      {e.report_hash === latest.report_hash ? (
                        <CheckCircle2
                          size={13}
                          aria-label="matches latest"
                          style={{
                            display: 'inline',
                            marginLeft: 6,
                            color: 'var(--color-success)',
                            verticalAlign: '-2px',
                          }}
                        />
                      ) : null}
                    </td>
                    <td className="mono faint">{e.report.ledger.fingerprint}</td>
                    <td className="num faint">{time(e.created_at)}</td>
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
