import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shinrai — paper market sandbox',
  description: 'Auditable, paper-only NBA prediction-market sandbox for AI agents.',
};

export const viewport: Viewport = { themeColor: '#0A0D0C', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
