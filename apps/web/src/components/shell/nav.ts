import { Activity, BookOpenCheck, Gauge, History, Network, type LucideIcon } from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  match: string[];
};

export const NAV: NavItem[] = [
  {
    href: '/',
    label: 'Overview',
    icon: Gauge,
    description: 'Market, thesis, book and operator actions',
    match: ['/'],
  },
  {
    href: '/runs/',
    label: 'Runs',
    icon: Activity,
    description: 'Agent runs and decision dossiers',
    match: ['/runs', '/dossier'],
  },
  {
    href: '/ledger/',
    label: 'Ledger',
    icon: BookOpenCheck,
    description: 'Balances and the double-entry journal',
    match: ['/ledger'],
  },
  {
    href: '/replay/',
    label: 'Replay',
    icon: History,
    description: 'Deterministic replay and evaluation',
    match: ['/replay'],
  },
  {
    href: '/system/',
    label: 'System',
    icon: Network,
    description: 'Outbox, projections and dead letters',
    match: ['/system'],
  },
];

export function activeNav(path: string): NavItem | undefined {
  const clean = path.replace(/\/$/, '') || '/';
  return NAV.find((n) => n.match.some((m) => (m === '/' ? clean === '/' : clean.startsWith(m))));
}
