'use client';

import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Hourglass,
  Info,
  LoaderCircle,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ApiFailure } from '@/lib/api';

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'signal';

const ICONS: Record<Tone, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  neutral: Info,
  signal: CircleDot,
};

/** Status is always icon + text + color. */
export function Status({
  tone,
  children,
  icon,
}: {
  tone: Tone;
  children: ReactNode;
  icon?: typeof CheckCircle2;
}) {
  const Icon = icon ?? ICONS[tone];
  return (
    <span className={`pill tone-${tone}`}>
      <Icon size={14} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

/** Maps any server-side decision/outcome word to a status pill. */
export function DecisionStatus({ value }: { value: string | null | undefined }) {
  switch (value) {
    case 'approved':
    case 'accepted':
    case 'completed':
      return <Status tone="success">{value === 'approved' ? 'Policy approved' : value}</Status>;
    case 'approval_required':
    case 'pending':
      return (
        <Status tone="warning" icon={Hourglass}>
          Awaiting approval
        </Status>
      );
    case 'blocked':
      return <Status tone="danger">Policy blocked</Status>;
    case 'rejected':
    case 'failed':
      return <Status tone="danger">{value}</Status>;
    case 'info':
      return <Status tone="neutral">info</Status>;
    default:
      return <Status tone="neutral">{value ?? 'no decision'}</Status>;
  }
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="card empty" role="status" aria-live="polite">
      <div className="row" style={{ justifyContent: 'center' }}>
        <LoaderCircle size={18} aria-hidden="true" />
        <span className="secondary">Loading {label}…</span>
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiFailure; onRetry?: () => void }) {
  return (
    <div className="card" role="alert">
      <div className="stack">
        <Status tone="danger">{error.code}</Status>
        <p>{error.message}</p>
        {error.correlationId ? <p className="meta">Trace {error.correlationId}</p> : null}
        {onRetry ? (
          <div>
            <button type="button" className="btn" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <div className="stack" style={{ justifyItems: 'center' }}>
        <h2 className="h2">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Meta({ children }: { children: ReactNode }) {
  return <p className="meta">{children}</p>;
}

/** Live region for command results so screen readers hear accept/reject outcomes. */
export function Announce({ children }: { children: ReactNode }) {
  return (
    <div aria-live="polite" role="status">
      {children}
    </div>
  );
}
