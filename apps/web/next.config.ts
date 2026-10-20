import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  transpilePackages: ['@shinrai/contracts'],
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default config;
