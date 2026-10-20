import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/jetbrains-mono';
import { AppShell } from '@/components/shell/AppShell';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/shell.css';
import '../styles/components.css';
import '../styles/views.css';

export const metadata: Metadata = {
  title: 'Shinrai — agent market OS',
  description: 'Auditable, paper-only NBA prediction-market sandbox for AI agents.',
};

export const viewport: Viewport = { themeColor: '#0A0D0C', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
