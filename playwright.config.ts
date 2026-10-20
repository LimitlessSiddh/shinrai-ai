import { defineConfig, devices } from '@playwright/test';

/** E2E runs against an isolated stack: API :4100 (database shinrai_e2e) and the static export on :3100. */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: [
    {
      command: 'tsx scripts/e2e-stack.ts',
      url: 'http://localhost:4100/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        'pnpm --filter @shinrai/web exec next build && tsx scripts/serve-static.ts apps/web/out 3100',
      url: 'http://localhost:3100',
      reuseExistingServer: false,
      timeout: 180_000,
      env: { NEXT_PUBLIC_API_URL: 'http://localhost:4100', NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],
});
