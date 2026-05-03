import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['json', { outputFile: 'playwright-report/results.json' }]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    // Follow cross-domain redirects (Cognito Hosted UI is on a separate domain)
    ignoreHTTPSErrors: false,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Do NOT start a dev server automatically — operator must run `pnpm dev` beforehand.
  // webServer block is intentionally omitted; E2E is run against an already-running instance.
});
