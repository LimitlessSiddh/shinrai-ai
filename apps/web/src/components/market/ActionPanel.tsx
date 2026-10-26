'use client';

import { Bot, Gavel, Hourglass, LoaderCircle, ReceiptText, ShieldAlert } from 'lucide-react';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api, ApiFailure, credits, newKey } from '@/lib/api';
import { isOrderRequest } from '@/lib/derive';
import type { MarketDetail } from '@/lib/types';
import { useWorkspace } from '@/lib/workspace';
import { Panel, Status } from '../ui';

type TabId = 'agent' | 'order' | 'resolve';
const TABS: { id: TabId; label: string; icon: typeof Bot }[] = [
  { id: 'agent', label: 'Agent run', icon: Bot },
  { id: 'order', label: 'Paper order', icon: ReceiptText },
  { id: 'resolve', label: 'Resolve', icon: Gavel },
];

const failure = (e: unknown) =>
  e instanceof ApiFailure
    ? { code: e.code, message: e.message, trace: e.correlationId }
    : { code: 'ERROR', message: String(e), trace: null };

function AgentTab({ disabled }: { disabled: boolean }) {
  const { fixture, notify, refresh } = useWorkspace();
  const [scenario, setScenario] = useState('research-happy');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!fixture) return;
    setBusy(true);
    try {
      const r = await api<{ runId: string; status: string }>('/agent-runs', {
        method: 'POST',
        body: { fixtureVersion: fixture.fixtureVersion, scenarioId: scenario },
      });
      notify({
        tone: 'success',
        title: `Agent run ${r.data.status}`,
        detail: `trace ${r.correlationId}`,
        href: `/dossier/?run=${r.data.runId}`,
        hrefLabel: 'Open dossier',
      });
      refresh();
    } catch (e) {
      const f = failure(e);
      notify({ tone: 'danger', title: f.code, detail: f.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        The agent can only call five typed tools. Every order request passes deterministic policy
        before the matching core sees it.
      </p>
      <fieldset className="choices" disabled={busy || disabled}>
        <legend className="label" style={{ marginBottom: 'var(--space-2)' }}>
          Scenario
        </legend>
        {(fixture?.scenarios ?? []).map((s) => (
          <label key={s.scenarioId} className="choice">
            <input
              type="radio"
              name="scenario"
              value={s.scenarioId}
              checked={scenario === s.scenarioId}
              onChange={() => setScenario(s.scenarioId)}
            />
            <span className="row between" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <span style={{ minWidth: 0 }}>
                <span className="choice-title">{s.title.replace(/^Unsafe: /, '')}</span>
                <span
                  className="faint mono"
                  style={{ display: 'block', fontSize: 'var(--text-xs)' }}
                >
                  {s.agentId}
                </span>
              </span>
              {s.title.startsWith('Unsafe') ? (
                <Status tone="warning" icon={ShieldAlert}>
                  Unsafe
                </Status>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={run}
        disabled={busy || disabled || !fixture}
      >
        {busy ? (
          <LoaderCircle size={16} className="spin" aria-hidden="true" />
        ) : (
          <Bot size={16} aria-hidden="true" />
        )}
        {busy ? 'Running…' : 'Run agent'}
      </button>
      {disabled ? <p className="help">The market is resolved; agent runs are closed.</p> : null}
    </div>
  );
}

function OrderTab({ detail, disabled }: { detail: MarketDetail; disabled: boolean }) {
  const { notify, refresh } = useWorkspace();
  const m = detail.market;
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [price, setPrice] = useState(60);
  const [qty, setQty] = useState(5);
  const [key, setKey] = useState(() => newKey('ui-order'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof failure> | null>(null);
  const priceId = useId();
  const qtyId = useId();

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{
        event: { payload: { order: { status: string; filledQuantity: number } } };
      }>('/orders', {
        method: 'POST',
        body: { marketId: m.marketId, outcome, price, quantity: qty, idempotencyKey: key },
      });
      const o = r.data.event.payload.order;
      notify({
        tone: 'success',
        title: `Order ${o.status}`,
        detail: `BUY ${outcome} ${qty} @ ${price}¢ · filled ${o.filledQuantity} · trace ${r.correlationId}`,
      });
      setKey(newKey('ui-order'));
      refresh();
    } catch (e) {
      const f = failure(e);
      setError(f);
      notify({ tone: 'danger', title: `Rejected · ${f.code}`, detail: f.message });
      setKey(newKey('ui-order'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate={false}>
      <fieldset disabled={busy || disabled} className="stack">
        <legend className="visually-hidden">Paper order</legend>
        <div className="tabs" role="group" aria-label="Outcome">
          {(['YES', 'NO'] as const).map((o) => (
            <button
              key={o}
              type="button"
              className="tab"
              aria-pressed={outcome === o}
              onClick={() => setOutcome(o)}
            >
              {o} · {o === 'YES' ? m.yesMeans : `not ${m.yesMeans}`}
            </button>
          ))}
        </div>
        <div className="grid cols-2" style={{ gap: 'var(--space-3)' }}>
          <label className="field" htmlFor={priceId}>
            Limit price (¢)
            <input
              id={priceId}
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              required
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />
          </label>
          <label className="field" htmlFor={qtyId}>
            Contracts
            <input
              id={qtyId}
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              max={100000}
              required
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="callout">
          <ReceiptText
            size={16}
            style={{ color: 'var(--color-steel)', flex: 'none', marginTop: 2 }}
            aria-hidden="true"
          />
          <span>
            Reserves up to <strong className="mono">{credits(price * qty)}</strong> paper credits
            until filled or cancelled. Same command path, idempotency and ledger as agent orders.
          </span>
        </div>
        {error ? (
          <p className="callout danger" role="alert" data-testid="order-error">
            <span>
              <strong>{error.code}</strong> — {error.message}
              {error.trace ? (
                <span className="label wrap-any" style={{ display: 'block', marginTop: 4 }}>
                  trace {error.trace}
                </span>
              ) : null}
            </span>
          </p>
        ) : null}
        <button type="submit" className="btn btn-block">
          {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : null}
          {busy ? 'Submitting…' : 'Submit paper order'}
        </button>
      </fieldset>
    </form>
  );
}

function ResolveTab({ detail }: { detail: MarketDetail }) {
  const { notify, refresh } = useWorkspace();
  const m = detail.market;
  const [choice, setChoice] = useState<'YES' | 'NO' | null>(null);
  const [busy, setBusy] = useState(false);
  if (m.status !== 'open') {
    return (
      <div className="stack">
        <Status tone="neutral">Resolved {m.winningOutcome}</Status>
        <p className="muted">
          Settlement already ran exactly once. Retrying returns the original resolution.
        </p>
      </div>
    );
  }
  const resolve = async () => {
    if (!choice) return;
    setBusy(true);
    try {
      const r = await api('/markets/' + encodeURIComponent(m.marketId) + '/resolve', {
        method: 'POST',
        body: {
          winningOutcome: choice,
          source: 'operator:fixture-final-score',
          idempotencyKey: newKey('ui-resolve'),
        },
      });
      notify({
        tone: 'success',
        title: `Market resolved ${choice}`,
        detail: `Settled once · trace ${r.correlationId}`,
      });
      refresh();
    } catch (e) {
      const f = failure(e);
      notify({ tone: 'danger', title: f.code, detail: f.message });
    } finally {
      setBusy(false);
      setChoice(null);
    }
  };
  return (
    <div className="stack">
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Resolution cancels every resting order, pays 100 per winning contract from escrow and closes
        the market. It cannot be undone.
      </p>
      <fieldset className="choices">
        <legend className="label" style={{ marginBottom: 'var(--space-2)' }}>
          Winning outcome
        </legend>
        {(['YES', 'NO'] as const).map((o) => (
          <label key={o} className="choice">
            <input
              type="radio"
              name="winner"
              checked={choice === o}
              onChange={() => setChoice(o)}
            />
            <span className="choice-title">
              {o} — {o === 'YES' ? m.yesMeans : `not ${m.yesMeans}`}
            </span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="btn btn-danger btn-block"
        disabled={!choice || busy}
        onClick={resolve}
      >
        <Gavel size={16} aria-hidden="true" />
        {choice ? `Confirm: resolve ${choice}` : 'Choose an outcome to resolve'}
      </button>
    </div>
  );
}

export function ActionPanel({ detail }: { detail: MarketDetail }) {
  const [tab, setTab] = useState<TabId>('agent');
  const closed = detail.market.status !== 'open';
  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % TABS.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + TABS.length) % TABS.length
          : -1;
    const target = TABS[next];
    if (target) {
      setTab(target.id);
      document.getElementById(`tab-${target.id}`)?.focus();
    }
  };
  return (
    <Panel title="Operator actions" id="actions">
      <div
        className="tabs"
        role="tablist"
        aria-label="Operator actions"
        onKeyDown={onKey}
        style={{ marginBottom: 'var(--space-4)' }}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              className="tab row"
              style={{ justifyContent: 'center', gap: 6 }}
              aria-selected={tab === t.id}
              aria-controls={`tabpanel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
            >
              <Icon size={14} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'agent' ? <AgentTab disabled={closed} /> : null}
        {tab === 'order' ? <OrderTab detail={detail} disabled={closed} /> : null}
        {tab === 'resolve' ? <ResolveTab detail={detail} /> : null}
      </div>
    </Panel>
  );
}

export function ApprovalQueue({ detail }: { detail: MarketDetail }) {
  const { notify, refresh } = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);
  const pending = detail.runs.filter((r) => r.pending_approval);
  if (!pending.length) return null;
  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id);
    try {
      const r = await api<{ status: string }>(`/approvals/${encodeURIComponent(id)}/${decision}`, {
        method: 'POST',
      });
      notify({
        tone: r.data.status === 'approved' ? 'success' : 'neutral',
        title: `Approval ${r.data.status}`,
        detail: `trace ${r.correlationId}`,
      });
      refresh();
    } catch (e) {
      const f = failure(e);
      notify({ tone: 'danger', title: f.code, detail: f.message });
    } finally {
      setBusy(null);
    }
  };
  return (
    <section
      className="callout warning"
      aria-labelledby="approvals-title"
      style={{ display: 'grid', gap: 'var(--space-3)' }}
    >
      <div className="row" style={{ gap: 8 }}>
        <Hourglass size={16} style={{ color: 'var(--color-warning)' }} aria-hidden="true" />
        <h2 id="approvals-title" className="panel-title">
          {pending.length} order{pending.length === 1 ? '' : 's'} waiting for a human decision
        </h2>
      </div>
      {pending.slice(0, 3).map((r) => {
        const req = isOrderRequest(r.order_request) ? r.order_request : null;
        return (
          <div
            key={r.run_id}
            className="row between"
            style={{
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3)',
            }}
          >
            <span>
              <strong className="mono">{r.agent_id}</strong>{' '}
              <span className="muted">
                wants BUY {req?.outcome} {req?.quantity} @ {req?.price}¢ (
                {credits(req ? req.price * req.quantity : 0)} credits)
              </span>
            </span>
            <span className="row">
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy !== null}
                onClick={() => decide(r.pending_approval ?? '', 'approve')}
              >
                Approve
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={busy !== null}
                onClick={() => decide(r.pending_approval ?? '', 'reject')}
              >
                Reject
              </button>
            </span>
          </div>
        );
      })}
      {pending.length > 3 ? (
        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          + {pending.length - 3} more in the run log.
        </p>
      ) : null}
    </section>
  );
}
