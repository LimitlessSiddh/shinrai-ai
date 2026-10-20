'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api, ApiFailure, newKey } from '@/lib/api';
import type { FixtureInfo, MarketDetail } from '@/lib/types';
import { Announce, DecisionStatus, Meta, Status } from './ui';

type Outcome = { tone: 'ok' | 'bad'; text: string; correlationId: string | null; runId?: string };

function describeFailure(e: unknown): Outcome {
  if (e instanceof ApiFailure)
    return { tone: 'bad', text: `${e.code}: ${e.message}`, correlationId: e.correlationId };
  return { tone: 'bad', text: String(e), correlationId: null };
}

function Result({ r }: { r: Outcome | null }) {
  return (
    <Announce>
      {r ? (
        <p className="row" data-testid="command-result">
          {r.tone === 'ok' ? (
            <Status tone="success">Accepted</Status>
          ) : (
            <Status tone="danger">Rejected</Status>
          )}
          <span>{r.text}</span>
          {r.correlationId ? <span className="meta">trace {r.correlationId}</span> : null}
          {r.runId ? (
            <Link className="link" href={`/dossier/?run=${encodeURIComponent(r.runId)}`}>
              Open dossier →
            </Link>
          ) : null}
        </p>
      ) : null}
    </Announce>
  );
}

export function OperatorConsole({
  detail,
  fixture,
  onChange,
}: {
  detail: MarketDetail;
  fixture: FixtureInfo | null;
  onChange: () => void;
}) {
  const m = detail.market;
  const [busy, setBusy] = useState<string | null>(null);
  const [agentResult, setAgentResult] = useState<Outcome | null>(null);
  const [orderResult, setOrderResult] = useState<Outcome | null>(null);
  const [scenario, setScenario] = useState('research-happy');
  const [orderKey, setOrderKey] = useState(() => newKey('ui-order'));
  const [confirmResolve, setConfirmResolve] = useState(false);
  const pending = detail.runs.filter((r) => r.pending_approval);

  const runAgent = async () => {
    if (!fixture) return;
    setBusy('agent');
    try {
      const r = await api<{ runId: string; status: string; correlationId: string }>('/agent-runs', {
        method: 'POST',
        body: { fixtureVersion: fixture.fixtureVersion, scenarioId: scenario },
      });
      setAgentResult({
        tone: 'ok',
        text: `Agent run ${r.data.status}`,
        correlationId: r.correlationId,
        runId: r.data.runId,
      });
      onChange();
    } catch (e) {
      setAgentResult(describeFailure(e));
    } finally {
      setBusy(null);
    }
  };

  const placeOrder = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setBusy('order');
    try {
      const r = await api<{
        event: { payload: { order: { status: string; filledQuantity: number } } };
      }>('/orders', {
        method: 'POST',
        body: {
          marketId: m.marketId,
          outcome: f.get('outcome'),
          price: Number(f.get('price')),
          quantity: Number(f.get('quantity')),
          idempotencyKey: orderKey,
        },
      });
      const o = r.data.event.payload.order;
      setOrderResult({
        tone: 'ok',
        text: `Order ${o.status}, filled ${o.filledQuantity}`,
        correlationId: r.correlationId,
      });
      setOrderKey(newKey('ui-order'));
      onChange();
    } catch (e) {
      setOrderResult(describeFailure(e));
      if (e instanceof ApiFailure && e.status !== 0) setOrderKey(newKey('ui-order'));
    } finally {
      setBusy(null);
    }
  };

  const resolve = async (winningOutcome: 'YES' | 'NO') => {
    setBusy('resolve');
    try {
      const r = await api('/markets/' + encodeURIComponent(m.marketId) + '/resolve', {
        method: 'POST',
        body: {
          winningOutcome,
          source: 'operator:fixture-final-score',
          idempotencyKey: newKey('ui-resolve'),
        },
      });
      setOrderResult({
        tone: 'ok',
        text: `Market resolved ${winningOutcome}`,
        correlationId: r.correlationId,
      });
      setConfirmResolve(false);
      onChange();
    } catch (e) {
      setOrderResult(describeFailure(e));
    } finally {
      setBusy(null);
    }
  };

  const decide = async (approvalId: string, decision: 'approve' | 'reject') => {
    setBusy(approvalId);
    try {
      const r = await api<{ status: string }>(
        `/approvals/${encodeURIComponent(approvalId)}/${decision}`,
        { method: 'POST' },
      );
      setAgentResult({
        tone: 'ok',
        text: `Approval ${r.data.status}`,
        correlationId: r.correlationId,
      });
      onChange();
    } catch (e) {
      setAgentResult(describeFailure(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="grid grid-2 section" aria-label="Operator controls">
      <article className="card stack" aria-labelledby="agent-title">
        <h2 id="agent-title" className="h2">
          Run a bounded agent
        </h2>
        <p className="secondary">
          The agent can only call five typed tools. Every order request passes deterministic policy
          before the matching core sees it.
        </p>
        <label>
          Scenario
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            disabled={!fixture}
          >
            {(fixture?.scenarios ?? []).map((s) => (
              <option key={s.scenarioId} value={s.scenarioId}>
                {s.title} ({s.agentId})
              </option>
            ))}
          </select>
        </label>
        <div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={runAgent}
            disabled={busy !== null || !fixture || m.status !== 'open'}
          >
            {busy === 'agent' ? 'Running…' : 'Run agent'}
          </button>
        </div>
        <Result r={agentResult} />
        {pending.length ? (
          <div className="stack">
            <Meta>Waiting for a human</Meta>
            {pending.map((r) => (
              <div
                key={r.run_id}
                className="banner row"
                style={{ justifyContent: 'space-between' }}
              >
                <span className="row">
                  <DecisionStatus value="approval_required" />
                  <span>
                    {r.agent_id}:{' '}
                    {'outcome' in (r.order_request ?? {})
                      ? `BUY ${String((r.order_request as { outcome: string }).outcome)}`
                      : 'order'}
                  </span>
                </span>
                <span className="row">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => decide(r.pending_approval ?? '', 'approve')}
                    disabled={busy !== null}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => decide(r.pending_approval ?? '', 'reject')}
                    disabled={busy !== null}
                  >
                    Reject
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </article>

      <article className="card stack" aria-labelledby="order-title">
        <h2 id="order-title" className="h2">
          Human paper order
        </h2>
        <form className="stack" onSubmit={placeOrder} aria-describedby="order-help">
          <p id="order-help" className="secondary">
            Paper credits only. Same command path, idempotency and ledger as agent orders.
          </p>
          <fieldset className="grid grid-4" disabled={busy !== null || m.status !== 'open'}>
            <legend className="visually-hidden">Order details</legend>
            <label>
              Outcome
              <select name="outcome" defaultValue="YES">
                <option value="YES">YES — {m.yesMeans}</option>
                <option value="NO">NO — not {m.yesMeans}</option>
              </select>
            </label>
            <label>
              Limit price (¢)
              <input
                name="price"
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                required
                defaultValue={60}
              />
            </label>
            <label>
              Contracts
              <input
                name="quantity"
                type="number"
                inputMode="numeric"
                min={1}
                max={100000}
                required
                defaultValue={5}
              />
            </label>
            <div style={{ alignSelf: 'end' }}>
              <button type="submit" className="btn">
                {busy === 'order' ? 'Submitting…' : 'Submit paper order'}
              </button>
            </div>
          </fieldset>
        </form>
        <Result r={orderResult} />
        <hr className="divider" />
        {m.status === 'open' ? (
          confirmResolve ? (
            <div className="row" role="group" aria-label="Confirm market resolution">
              <span>Resolve from the fixture final score. This settles every position once.</span>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => resolve('YES')}
                disabled={busy !== null}
              >
                Confirm: {m.yesMeans}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => resolve('NO')}
                disabled={busy !== null}
              >
                Confirm: not {m.yesMeans}
              </button>
              <button type="button" className="btn" onClick={() => setConfirmResolve(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setConfirmResolve(true)}
              >
                Resolve market…
              </button>
            </div>
          )
        ) : (
          <DecisionStatus value="completed" />
        )}
      </article>
    </section>
  );
}
