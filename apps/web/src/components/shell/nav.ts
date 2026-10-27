import {
  ClipboardCheck,
  FlaskConical,
  Gauge,
  Radio,
  Settings2,
  type LucideIcon,
} from 'lucide-react';

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
    label: 'Workspace',
    icon: Gauge,
    description: 'NBA slate, evidence and paper research runs',
    match: ['/'],
  },
  {
    href: '/agents/',
    label: 'Agents',
    icon: Settings2,
    description: 'Versioned agent purpose and policy setup',
    match: ['/agents'],
  },
  {
    href: '/experiments/',
    label: 'Experiments',
    icon: FlaskConical,
    description: 'Fair comparisons on settled fixtures',
    match: ['/experiments', '/replay'],
  },
  {
    href: '/arena/',
    label: 'Arena',
    icon: Radio,
    description: 'Read-only public research records',
    match: ['/arena'],
  },
  {
    href: '/runs/',
    label: 'Audit records',
    icon: ClipboardCheck,
    description: 'Runs, traces, ledger and system health',
    match: ['/runs', '/dossier', '/ledger', '/system'],
  },
];

export function activeNav(path: string): NavItem | undefined {
  const clean = path.replace(/\/$/, '') || '/';
  return NAV.find((n) => n.match.some((m) => (m === '/' ? clean === '/' : clean.startsWith(m))));
}
