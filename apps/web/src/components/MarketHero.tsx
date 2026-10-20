'use client';

import Link from 'next/link';
import { credits, percent } from '@/lib/api';
import type { MarketDetail, OrderRequest, RunSummary } from '@/lib/types';
import { DecisionStatus, Meta, Status } from './ui';

/** The run whose order request is the market's current thesis: newest run that asked to trade. */
export function activeThesis(runs: RunSummary[]): RunSummary | null {
  return runs.find((r) => r.order_request && 'outcome' in r.order_request) ?? null;
}

function PulseRings({ market, agent }: { market: number | null; agent: number | null }) {
  const r = (p: number) => 24 + p * 96;
  const desc = `Market implies ${market === null ? 'no price yet' : percent(market, 0)} for YES; the agent estimates ${agent === null ? 'nothing yet' : percent(agent, 0)}.`;
  return (
    <svg
      viewBox="0 0 260 260"
      width="220"
      height="220"
      role="img"
      aria-labelledby="pulse-title pulse-desc"
    >
      <title id="pulse-title">Market pulse</title>
      <desc id="pulse-desc">{desc}</desc>
      <circle
        cx="130"
        cy="130"
        r="120"
        fill="none"
        stroke="var(--color-border-strong)"
        strokeWidth="1"
      />
      {market !== null ? (
        <circle
          cx="130"
          cy="130"
          r={r(market)}
          fill="none"
          stroke="var(--color-steel)"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
      ) : null}
      {agent !== null ? (
        <circle
          cx="130"
          cy="130"
          r={r(agent)}
          fill="none"
          stroke="var(--color-signal)"
          strokeWidth="2"
        />
      ) : null}
      <circle cx="130" cy="130" r="8" fill="var(--color-signal)" />
    </svg>
  );
}

export function MarketHero({ detail }: { detail: MarketDetail }) {
  const m = detail.market;
  const view = detail.projection?.view;
  const yes = view ? (view.lastYesPrice ?? view.bestAsk.YES) : null;
  const thesis = activeThesis(detail.runs);
  const req = thesis?.order_request as OrderRequest | undefined;
  const cited = thesis?.conclusion?.evidenceIds ?? req?.evidenceIds ?? [];
  const evidence = detail.evidence.filter((e) => cited.includes(e.evidenceId));
  const change =
    view?.openingYesPrice && view.lastYesPrice
      ? (view.lastYesPrice - view.openingYesPrice) / view.openingYesPrice
      : null;

  return (
    <section className="grid grid-hero" aria-labelledby="market-title">
      <div className="stack" style={{ gap: 24 }}>
        <Meta>
          Live paper market / {m.league} {m.season}
        </Meta>
        <h1 id="market-title" className="display">
          The market is a conversation.
        </h1>
        <p className="lede">
          Watch an agent form a thesis, ask for a trade, and prove why it was safe.
        </p>
        <p>{m.question}</p>
        <div className="row">
          {m.status === 'open' ? (
            <Status tone="success">
              {m.awayTeam.code} @ {m.homeTeam.code} · market open
            </Status>
          ) : (
            <Status tone="neutral">
              Resolved {m.winningOutcome} (
              {m.winningOutcome === 'YES' ? m.yesMeans : `not ${m.yesMeans}`})
            </Status>
          )}
        </div>
        <Meta>
          Tip-off{' '}
          {new Date(m.tipoffAt).toLocaleString('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
          })}{' '}
          ET / fixture {m.fixtureVersion}
        </Meta>

        <article className="card" aria-labelledby="saw-title">
          <Meta>The agent saw</Meta>
          <h2 id="saw-title" className="h2" style={{ marginTop: 8 }}>
            {evidence.length
              ? `${evidence.length === 2 ? 'Two' : evidence.length} cited signal${evidence.length === 1 ? '' : 's'}.`
              : 'No evidence cited yet.'}
          </h2>
          <ul className="secondary" style={{ paddingLeft: 18 }}>
            {evidence.map((e) => (
              <li key={e.evidenceId}>{e.title}</li>
            ))}
          </ul>
          <hr className="divider" />
          {thesis ? (
            <Link className="link" href={`/dossier/?run=${encodeURIComponent(thesis.run_id)}`}>
              Open the decision dossier →
            </Link>
          ) : (
            <span className="secondary">Run the agent to produce a thesis.</span>
          )}
        </article>
      </div>

      <article className="card selected" aria-labelledby="thread-title">
        <Meta>Game thread</Meta>
        <div
          className="row"
          style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}
        >
          <div>
            <h2 id="thread-title" className="h2">
              {m.awayTeam.name.toUpperCase()} <span className="secondary">(YES)</span>
            </h2>
            <p className="value-xl mono">
              {yes ?? '—'}
              <span className="secondary" style={{ fontSize: 32 }}>
                ¢
              </span>
            </p>
          </div>
          <p className="h2 mono">
            {yes === null ? '—' : 100 - yes}¢{' '}
            <span className="secondary">{m.homeTeam.name.toUpperCase()}</span>
          </p>
        </div>
        <hr className="divider" />
        <div className="grid grid-2">
          <div className="stack">
            <Meta>Agent thesis</Meta>
            {thesis && req ? (
              <>
                <p className="thesis">BUY {req.outcome}</p>
                <p>
                  {req.quantity} contracts at {req.price}¢ · {credits(req.price * req.quantity)}{' '}
                  credits
                </p>
                <div>
                  <DecisionStatus value={thesis.policy_decision} />
                </div>
                <p className="meta">
                  confidence {percent(req.probabilityYes, 0)} · evidence{' '}
                  {String(cited.length).padStart(2, '0')} · run {thesis.run_id.slice(0, 12)}
                </p>
              </>
            ) : (
              <p className="secondary">
                No active thesis. Use “Run agent” to start a bounded research run.
              </p>
            )}
          </div>
          <div className="stack" style={{ justifyItems: 'center' }}>
            <PulseRings
              market={yes === null ? null : yes / 100}
              agent={req?.probabilityYes ?? null}
            />
            <div>
              <Meta>Market pulse</Meta>
              <p className="value-lg mono">
                {change === null ? '—' : `${change >= 0 ? '+' : '−'}${percent(Math.abs(change))}`}
              </p>
              <Meta>vs opening implied odds · {view?.matchedContracts ?? 0} contracts matched</Meta>
            </div>
          </div>
        </div>
        {detail.projection ? null : (
          <p className="banner" style={{ marginTop: 16 }}>
            <Status tone="warning">Projection catching up</Status> The worker has not projected this
            market yet.
          </p>
        )}
      </article>
    </section>
  );
}
