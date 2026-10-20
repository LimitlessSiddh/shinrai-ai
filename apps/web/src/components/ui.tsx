'use client';

import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Hourglass,
  Info,
  RefreshCw,
  ShieldX,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ApiFailure } from '@/lib/api';

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'signal';

const ICONS: Record<Tone, LucideIcon> = {
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
  icon?: LucideIcon;
}) {
  const Icon = icon ?? ICONS[tone];
  return (
    <span className={`pill tone-${tone}`}>
      <Icon size={13} strokeWidth={2.25} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

/** Maps a server-side decision or outcome word to one consistent status pill. */
export function DecisionStatus({ value }: { value: string | null | undefined }) {
  switch (value) {
    case 'approved':
      return <Status tone="success">Policy approved</Status>;
    case 'accepted':
      return <Status tone="success">Accepted</Status>;
    case 'completed':
      return <Status tone="success">Completed</Status>;
    case 'approval_required':
    case 'pending':
      return (
        <Status tone="warning" icon={Hourglass}>
          Awaiting approval
        </Status>
      );
    case 'blocked':
      return (
        <Status tone="danger" icon={ShieldX}>
          Policy blocked
        </Status>
      );
    case 'rejected':
      return <Status tone="danger">Rejected</Status>;
    case 'failed':
      return <Status tone="danger">Failed</Status>;
    case 'info':
      return <Status tone="neutral">Info</Status>;
    default:
      return <Status tone="neutral">{value ?? 'No order'}</Status>;
  }
}

export function Panel({
  title,
  icon: Icon,
  actions,
  children,
  strong,
  flush,
  id,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  strong?: boolean;
  flush?: boolean;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className={`panel${strong ? ' strong' : ''}`} aria-labelledby={headingId} id={id}>
      {title ? (
        <header className="panel-head">
          <h2 className="panel-title" id={headingId}>
            {Icon ? <Icon size={16} aria-hidden="true" /> : null}
            {title}
          </h2>
          {actions}
        </header>
      ) : null}
      <div className={`panel-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="stat-value" data-testid={testId}>
        {value}
      </span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

export function Empty({
  icon: Icon = Info,
  title,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={22} aria-hidden="true" />
      </span>
      <h2 className="panel-title" style={{ fontSize: 'var(--text-lg)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiFailure; onRetry?: () => void }) {
  return (
    <div className="panel" role="alert">
      <div className="empty">
        <span className="empty-icon" style={{ color: 'var(--color-danger)' }}>
          <XCircle size={22} aria-hidden="true" />
        </span>
        <Status tone="danger">{error.code}</Status>
        <p className="muted" style={{ maxWidth: '60ch' }}>
          {error.message}
        </p>
        {error.correlationId ? <p className="label wrap-any">Trace {error.correlationId}</p> : null}
        {onRetry ? (
          <button type="button" className="btn" onClick={onRetry}>
            <RefreshCw size={16} aria-hidden="true" /> Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Reserved-space placeholder while data loads (no layout jump when it arrives). */
export function Skeleton({
  height = 16,
  width = '100%',
}: {
  height?: number;
  width?: number | string;
}) {
  return (
    <span className="skeleton" style={{ display: 'block', height, width }} aria-hidden="true" />
  );
}

export function LoadingPanel({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <div className="panel" role="status" aria-live="polite">
      <div className="panel-body stack-sm">
        <span className="visually-hidden">Loading {label}…</span>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton
            key={i}
            height={i === 0 ? 24 : 14}
            width={i === 0 ? '40%' : `${90 - i * 12}%`}
          />
        ))}
      </div>
    </div>
  );
}
