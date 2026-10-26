'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, Crosshair, FileSearch, Layers, Repeat2 } from 'lucide-react';
import { credits, percent, time } from '@/lib/api';
import { activeThesis, isOrderRequest, shortId, yesPrice } from '@/lib/derive';
import type { MarketDetail } from '@/lib/types';
import { DecisionStatus, Empty, Panel, Status } from '../ui';

export function MarketStrip({ detail }: { detail: MarketDetail }) {
  const m = detail.market;
  const yes = yesPrice(detail);
  return (
    <section className="panel market-strip" aria-labelledby="market-title">
      <div className="stack-sm">
        <div className="row">
          <span className="label">
            {m.league} {m.season} · {m.fixtureVersion}
          </span>
          {m.status === 'open' ? (
            <Status tone="success">Market open</Status>
          ) : (
            <Status tone="neutral">
              Resolved {m.winningOutcome === 'YES' ? m.yesMeans : `not ${m.yesMeans}`}
            </Status>
          )}
        </div>
        <h1 id="market-title" className="matchup">
          <span>{m.awayTeam.name}</span> <span className="at">at</span>{' '}
          <span>{m.homeTeam.name}</span>
        </h1>
        <p className="muted">{m.question}</p>
        <p className="label">
          Tip-off{' '}
          {new Date(m.tipoffAt).toLocaleString('en-US', {
            timeZone: 'America/New_York',
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}{' '}
          ET · {m.rules.length} resolution rules
        </p>
      </div>
      <div className="quotes" aria-label="Paper prices">
        <div className="quote">
          <span className="label">YES · {m.awayTeam.code}</span>
          <span className="quote-price" data-testid="yes-price">
            {yes ?? '—'}
            <small>¢</small>
          </span>
          <span className="stat-hint">{yes === null ? 'no trades yet' : `implied ${yes}%`}</span>
        </div>
        <div className="quote">
          <span className="label">NO · {m.homeTeam.code}</span>
          <span className="quote-price">
            {yes === null ? '—' : 100 - yes}
            <small>¢</small>
          </span>
          <span className="stat-hint">
            {detail.projection?.view.matchedContracts ?? 0} contracts matched
          </span>
        </div>
      </div>
    </section>
  );
}

/** Signature view: market-implied YES probability vs the agent's belief on one 0–100 scale. */
export function EdgeMeter({ detail }: { detail: MarketDetail }) {
  const thesis = activeThesis(detail.runs);
  const belief =
    thesis?.conclusion?.probabilityYes ??
    (isOrderRequest(thesis?.order_request) ? thesis.order_request.probabilityYes : null);
  const market = yesPrice(detail);
  const opening = detail.projection?.view.openingYesPrice ?? null;
  const agentPct = belief === null ? null : Math.round(belief * 1000) / 10;
  const gap = agentPct !== null && market !== null ? agentPct - market : null;
  const summary =
    market === null
      ? 'No trades yet, so the market has no implied probability.'
      : `Market implies ${market}% for YES.${agentPct === null ? ' No agent thesis yet.' : ` The agent believes ${agentPct}%, ${Math.abs(gap ?? 0).toFixed(1)} points ${(gap ?? 0) >= 0 ? 'above' : 'below'} the market.`}`;

  return (
    <Panel
      title="Market vs agent belief"
      icon={Crosshair}
      id="edge"
      actions={<span className="label">probability YES</span>}
    >
      <p className="visually-hidden">{summary}</p>
      <div className="edge-scale" aria-hidden="true">
        <div className="edge-track" />
        {market !== null ? <div className="edge-yes" style={{ width: `${market}%` }} /> : null}
        {gap !== null && market !== null ? (
          <div
            className="edge-gap"
            style={{ left: `${Math.min(market, market + gap)}%`, width: `${Math.abs(gap)}%` }}
          />
        ) : null}
        {opening !== null ? (
          <div className="edge-marker opening" style={{ left: `${opening}%` }}>
            <span className="stem" />
          </div>
        ) : null}
        {market !== null ? (
          <div className="edge-marker market" style={{ left: `${market}%` }}>
            <span className="stem" />
            <span className="flag">MARKET {market}%</span>
          </div>
        ) : null}
        {agentPct !== null ? (
          <div className="edge-marker agent" style={{ left: `${agentPct}%` }}>
            <span className="stem" />
            <span className="flag">AGENT {agentPct}%</span>
          </div>
        ) : null}
      </div>
      <div className="edge-ticks" aria-hidden="true">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
      <div className="row between" style={{ marginTop: 'var(--space-5)' }}>
        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          {summary}
        </p>
        {gap !== null ? (
          <span
            className="mono"
            style={{ fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}
          >
            {gap >= 0 ? '+' : '−'}
            {Math.abs(gap).toFixed(1)} pts
          </span>
        ) : null}
      </div>
      <p
        className="label"
        style={{ marginTop: 'var(--space-3)', textTransform: 'none', letterSpacing: 0 }}
      >
        Steel = market implied · dotted = opening print · signal = active agent thesis. Analysis
        only, not advice.
      </p>
    </Panel>
  );
}

export function ThesisCard({ detail }: { detail: MarketDetail }) {
  const thesis = activeThesis(detail.runs);
  const req = thesis && isOrderRequest(thesis.order_request) ? thesis.order_request : null;
  if (!thesis || !req) {
    return (
      <Panel title="Active thesis" icon={FileSearch} id="thesis" strong>
        <Empty icon={FileSearch} title="No thesis yet">
          <p className="muted">
            Run the research agent from the action panel. Its order request and policy decision
            appear here.
          </p>
        </Empty>
      </Panel>
    );
  }
  const cited = thesis.conclusion?.evidenceIds ?? req.evidenceIds;
  const evidence = detail.evidence.filter((e) => cited.includes(e.evidenceId));
  return (
    <Panel
      title="Active thesis"
      icon={FileSearch}
      id="thesis"
      strong
      actions={<DecisionStatus value={thesis.policy_decision} />}
    >
      <div className="grid cols-2" style={{ gap: 'var(--space-5)' }}>
        <div className="stack">
          <span className="label">
            {thesis.agent_id} · {thesis.scenario}
          </span>
          <p className="thesis-call" data-testid="thesis-call">
            BUY {req.outcome}
          </p>
          <p data-testid="thesis-order">
            {req.quantity} contracts at {req.price}¢ · {credits(req.price * req.quantity)} credits
          </p>
          <dl className="row" style={{ gap: 'var(--space-5)' }}>
            <div>
              <dt className="label">Belief</dt>
              <dd className="mono">{percent(req.probabilityYes, 0)}</dd>
            </div>
            <div>
              <dt className="label">Evidence</dt>
              <dd className="mono">{String(cited.length).padStart(2, '0')}</dd>
            </div>
            <div>
              <dt className="label">Run</dt>
              <dd className="mono">{shortId(thesis.run_id)}</dd>
            </div>
          </dl>
        </div>
        <div className="stack">
          <span className="label">What the agent cited</span>
          <ul className="stack-sm">
            {evidence.map((e) => (
              <li key={e.evidenceId} className="callout" style={{ padding: 'var(--space-3)' }}>
                <BookOpen
                  size={15}
                  style={{ color: 'var(--color-steel)', marginTop: 2, flex: 'none' }}
                  aria-hidden="true"
                />
                <span>
                  {e.title}
                  <span className="label" style={{ display: 'block', marginTop: 2 }}>
                    {e.source} · {e.stance.replace('_', ' ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <Link className="link" href={`/dossier/?run=${encodeURIComponent(thesis.run_id)}`}>
            Open decision dossier <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Panel>
  );
}

export function OrderBook({ detail }: { detail: MarketDetail }) {
  const sides = (['YES', 'NO'] as const).map((o) => detail.book.filter((l) => l.outcome === o));
  const max = Math.max(1, ...detail.book.map((l) => l.quantity));
  return (
    <Panel
      title="Order book"
      icon={Layers}
      id="book"
      flush
      actions={<span className="label">resting bids</span>}
    >
      {detail.book.length === 0 ? (
        <Empty icon={Layers} title="Book is empty">
          <p className="muted">
            {detail.market.status === 'open'
              ? 'No resting orders.'
              : 'Resolution cancelled every resting order.'}
          </p>
        </Empty>
      ) : (
        <div className="book" data-testid="order-book">
          {sides.map((levels, i) => (
            <div className="book-side" key={i}>
              <div className="book-row book-head">
                <span>Bid {i === 0 ? 'YES' : 'NO'}</span>
                <span style={{ textAlign: 'right' }}>Qty</span>
                <span style={{ textAlign: 'right' }}>#</span>
              </div>
              {levels.length === 0 ? <p className="book-row faint">—</p> : null}
              {levels.map((l) => (
                <div className="book-row" key={`${l.outcome}-${l.price}`}>
                  <span
                    className="depth"
                    style={{ width: `${(l.quantity / max) * 100}%` }}
                    aria-hidden="true"
                  />
                  <span>{l.price}¢</span>
                  <span style={{ textAlign: 'right' }}>{l.quantity}</span>
                  <span style={{ textAlign: 'right' }} className="faint">
                    {l.orders}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function Fills({ detail }: { detail: MarketDetail }) {
  return (
    <Panel title="Recent fills" icon={Repeat2} id="fills" flush>
      {detail.fills.length === 0 ? (
        <Empty icon={Repeat2} title="No fills yet" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">Recent matched fills, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col" className="num">
                  YES ¢
                </th>
                <th scope="col" className="num">
                  Qty
                </th>
                <th scope="col">YES / NO</th>
              </tr>
            </thead>
            <tbody>
              {detail.fills.map((f) => (
                <tr key={f.fill_id}>
                  <td className="mono faint">{time(f.created_at)}</td>
                  <td className="num">{f.yes_price}</td>
                  <td className="num">{f.quantity}</td>
                  <td className="mono" style={{ fontSize: 'var(--text-xs)' }}>
                    {f.yes_owner_id} / {f.no_owner_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
