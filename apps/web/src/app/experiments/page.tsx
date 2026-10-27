'use client';

import Link from 'next/link';
import { ArrowRight, FlaskConical } from 'lucide-react';
import { ErrorState, LoadingPanel, PageHeader, Panel, Stat, Status } from '@/components/ui';
import { usePoll } from '@/lib/api';
import type { Evaluation } from '@/lib/types';

export default function ExperimentsPage() {
  const evaluations = usePoll<Evaluation[]>('/evaluations', 5000);
  const latest = evaluations.data?.[0];
  const reports = latest ? Object.entries(latest.report.agents) : [];
  const content = evaluations.error ? (
    <ErrorState error={evaluations.error} onRetry={evaluations.refresh} />
  ) : evaluations.loading ? (
    <LoadingPanel label="experiments" />
  ) : latest ? (
    <>
      <div className="callout">
        <FlaskConical size={18} aria-hidden="true" />
        <span>
          <strong>Comparison boundary:</strong> {latest.fixture_version} ·{' '}
          {latest.report.runs.length} settled run record(s) · report {latest.report_hash}.
        </span>
      </div>
      <div className="experiment-metrics">
        <Stat
          label="Settled sample"
          value={latest.report.runs.length}
          hint="same fixture and cutoff"
        />
        <Stat
          label="Baseline"
          value={
            latest.report.market.lastYesPrice === null
              ? '—'
              : `${latest.report.market.lastYesPrice}%`
          }
          hint="last recorded market baseline"
        />
        <Stat label="Scoring" value="Brier first" hint="accuracy unavailable in current report" />
        <Stat
          label="Coverage"
          value={`${reports.filter(([, report]) => report.forecasts > 0).length}/${reports.length || 0}`}
          hint="agents with forecasts"
        />
      </div>
      <Panel title="Version comparison" flush>
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">Comparable agent evaluation reports</caption>
            <thead>
              <tr>
                <th>Version</th>
                <th className="num">Brier</th>
                <th className="num">Accuracy</th>
                <th className="num">Log loss</th>
                <th className="num">Forecasts</th>
                <th>Policy</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(([id, report]) => (
                <tr key={id}>
                  <th scope="row">{id}</th>
                  <td className="num">
                    <strong>{report.brierScore?.toFixed(4) ?? '—'}</strong>
                  </td>
                  <td className="num">Not reported</td>
                  <td className="num">{report.logLoss?.toFixed(4) ?? '—'}</td>
                  <td className="num">{report.forecasts}</td>
                  <td>
                    <Status tone={report.policyViolations === 0 ? 'success' : 'danger'}>
                      {report.policyViolations === 0
                        ? 'No violations'
                        : `${report.policyViolations} violations`}
                    </Status>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  ) : (
    <Panel>
      <div className="empty">
        <FlaskConical size={24} aria-hidden="true" />
        <h2 className="panel-title">No settled comparison yet</h2>
        <p className="muted">
          Run a replay to create an evaluation on a fixed, versioned fixture before comparing
          versions.
        </p>
      </div>
    </Panel>
  );
  return (
    <div className="stack settle" style={{ gap: 'var(--space-5)' }}>
      <PageHeader
        title="Compare versions carefully"
        description="Only compare the same settled fixture set, prediction cutoff, and scoring definition. Lower Brier score is better; accuracy is shown only when the report contract supplies it."
        actions={
          <Link className="btn btn-primary" href="/replay/">
            Run evaluation <ArrowRight size={16} aria-hidden="true" />
          </Link>
        }
      />
      {content}
    </div>
  );
}
