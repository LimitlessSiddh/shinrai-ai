'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Command, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { WorkspaceProvider, useWorkspace } from '@/lib/workspace';
import { Status } from '../ui';
import { CommandPalette } from './CommandPalette';
import { activeNav, NAV } from './nav';
import { Toasts } from './Toasts';

/** Ring-and-signal mark: the market (rings) around one active intent (signal). */
function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="27"
        height="27"
        rx="8"
        fill="var(--color-surface-strong)"
        stroke="var(--color-border-strong)"
      />
      <circle cx="14" cy="14" r="8" fill="none" stroke="var(--color-steel)" strokeWidth="1.5" />
      <circle
        cx="14"
        cy="14"
        r="4.5"
        fill="none"
        stroke="var(--color-steel)"
        strokeWidth="1.5"
        opacity="0.6"
      />
      <circle cx="17.5" cy="10.5" r="2.5" fill="var(--color-signal)" />
    </svg>
  );
}

function Health() {
  const { system, systemError } = useWorkspace();
  if (systemError) {
    return (
      <div className="row" style={{ gap: 8, color: 'var(--color-danger)' }}>
        <span className="dot" /> <span>API unreachable</span>
      </div>
    );
  }
  if (!system) return <span className="faint">Checking pipeline…</span>;
  const lag = system.unpublished + system.unprojected;
  const tone = system.deadLetters.length
    ? 'var(--color-danger)'
    : lag
      ? 'var(--color-warning)'
      : 'var(--color-success)';
  const text = system.deadLetters.length
    ? `${system.deadLetters.length} dead letter(s)`
    : lag
      ? `Projecting · ${lag} behind`
      : 'Pipeline live';
  return (
    <div className="row" style={{ gap: 8, color: tone }}>
      <span className={`dot${lag || system.deadLetters.length ? '' : ' live'}`} />
      <span>{text}</span>
    </div>
  );
}

function MarketChip() {
  const { detail } = useWorkspace();
  if (!detail) return null;
  const m = detail.market;
  return m.status === 'open' ? (
    <Status tone="success">
      {m.awayTeam.code} @ {m.homeTeam.code} · open
    </Status>
  ) : (
    <Status tone="neutral">
      {m.awayTeam.code} @ {m.homeTeam.code} · resolved {m.winningOutcome}
    </Status>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const current = activeNav(path);
  const [palette, setPalette] = useState(false);
  const { detail } = useWorkspace();
  const pending = detail?.runs.filter((r) => r.pending_approval).length ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Move focus to the page region on client-side navigation (screen readers hear the new page),
  // but never on first load, where the skip link must stay the first tab stop.
  const firstPath = useRef(path);
  useEffect(() => {
    if (path === firstPath.current) return;
    firstPath.current = '';
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [path]);

  const links = (variant: 'side' | 'tab') =>
    NAV.map((n) => {
      const Icon = n.icon;
      const isActive = current?.href === n.href;
      return (
        <li key={n.href}>
          <Link
            href={n.href}
            className={variant === 'side' ? 'nav-link' : undefined}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={variant === 'side' ? 18 : 20} aria-hidden="true" />
            <span>{n.label}</span>
            {variant === 'side' && n.href === '/' && pending ? (
              <span className="badge pill tone-warning" aria-label={`${pending} awaiting approval`}>
                {pending}
              </span>
            ) : null}
          </Link>
        </li>
      );
    });

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app">
        <aside className="sidebar" aria-label="Workspace">
          <Link href="/" className="brand">
            <BrandMark />
            <span>
              <span className="brand-name">SHINRAI</span>
              <span className="brand-sub label">Agent market OS</span>
            </span>
          </Link>
          <div className="env">
            <span className="row" style={{ gap: 8 }}>
              <ShieldCheck size={16} style={{ color: 'var(--color-steel)' }} aria-hidden="true" />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Paper only</span>
            </span>
            <span className="label">local · demo</span>
          </div>
          <nav aria-label="Primary">
            <p className="nav-section label">Workspace</p>
            <ul className="nav">{links('side')}</ul>
          </nav>
          <div className="sidebar-foot">
            <div className="health">
              <span className="label">System</span>
              <Health />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPalette(true)}
              style={{ justifyContent: 'space-between' }}
            >
              <span>Command menu</span>
              <span className="kbd">
                <Command size={11} aria-hidden="true" />K
              </span>
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <Link
              href="/"
              className="mobile-brand row"
              style={{ gap: 10 }}
              aria-label="Shinrai overview"
            >
              <BrandMark size={24} />
              <span className="brand-name" style={{ fontSize: 'var(--text-md)' }}>
                SHINRAI
              </span>
            </Link>
            <div className="crumbs">
              <span>demo</span>
              <span aria-hidden="true">/</span>
              <strong>{current?.label ?? 'Overview'}</strong>
              {path.startsWith('/dossier') ? (
                <>
                  <span aria-hidden="true">/</span>
                  <strong>Dossier</strong>
                </>
              ) : null}
            </div>
            <div className="topbar-actions">
              <MarketChip />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setPalette(true)}
                aria-label="Open command menu (Command K)"
              >
                <Command size={14} aria-hidden="true" />
                <span className="kbd" style={{ border: 0, padding: 0 }}>
                  K
                </span>
              </button>
            </div>
          </header>

          <main id="main" tabIndex={-1} className="content" style={{ outline: 'none' }}>
            {children}
          </main>
          <footer className="footnote">
            <strong className="muted">Paper credits only.</strong> An engineering sandbox for
            evaluating AI agents: credits have no cash value, nothing here is a wager or betting
            advice, and market data comes from a synthetic, versioned fixture.
          </footer>
        </div>
      </div>

      <nav className="tabbar" aria-label="Primary mobile">
        <ul style={{ display: 'contents' }}>{links('tab')}</ul>
      </nav>
      <Toasts />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <Frame>{children}</Frame>
    </WorkspaceProvider>
  );
}
