import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  // E2E builds use their own directory so they never disturb a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  trailingSlash: true,
  reactStrictMode: true,
  transpilePackages: ['@shinrai/contracts'],
  images: { unoptimized: true },
  poweredByHeader: false,
  // Keep the dev-only indicator clear of the sidebar's command-menu button.
  devIndicators: { position: 'bottom-right' },
};

export default config;
