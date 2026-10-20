'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/', label: 'Market' },
  { href: '/dossier/', label: 'Dossier' },
  { href: '/replay/', label: 'Replay' },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="shell">
        <header className="topbar">
          <Link href="/" className="brand">
            <strong>SHINRAI</strong>
            <span className="meta">AI market research OS</span>
          </Link>
          <nav aria-label="Primary">
            <ul className="nav" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {NAV.map((n) => {
                const active =
                  n.href === '/' ? path === '/' : path.startsWith(n.href.replace(/\/$/, ''));
                return (
                  <li key={n.href}>
                    <Link href={n.href} aria-current={active ? 'page' : undefined}>
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="footer">
          <p>
            <strong>Paper credits only.</strong> Shinrai is an engineering sandbox for evaluating AI
            agents. Credits have no cash value, nothing here is a wager or betting advice, and the
            market data comes from a synthetic, versioned fixture.
          </p>
        </footer>
      </div>
    </>
  );
}
