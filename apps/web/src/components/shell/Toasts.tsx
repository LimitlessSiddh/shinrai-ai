'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useWorkspace, type ToastTone } from '@/lib/workspace';

const ICON = {
  success: CheckCircle2,
  danger: XCircle,
  warning: AlertTriangle,
  neutral: Info,
} as const;
const COLOR: Record<ToastTone, string> = {
  success: 'var(--color-success)',
  danger: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  neutral: 'var(--color-steel)',
};

/** Command feedback. Polite live region: announced, never steals focus. */
export function Toasts() {
  const { toasts, dismiss } = useWorkspace();
  return (
    <div className="toasts" aria-live="polite" role="status">
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div key={t.id} className="toast" data-testid="toast" data-tone={t.tone}>
            <Icon size={18} style={{ color: COLOR[t.tone], marginTop: 1 }} aria-hidden="true" />
            <div className="stack-sm" style={{ gap: 4 }}>
              <strong>{t.title}</strong>
              {t.detail ? <span className="muted wrap-any">{t.detail}</span> : null}
              {t.href ? (
                <Link className="link" href={t.href} style={{ fontSize: 'var(--text-sm)' }}>
                  {t.hrefLabel ?? 'Open'} →
                </Link>
              ) : null}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
