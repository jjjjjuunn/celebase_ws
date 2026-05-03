/**
 * Cognito Hosted UI E2E — CHORE-007
 *
 * Prerequisites (operator must set before running):
 *   PLAYWRIGHT_BASE_URL   — running Next.js instance (e.g. http://localhost:3000)
 *   E2E_SMOKE_EMAIL       — test user email (must exist in Cognito staging pool)
 *   E2E_SMOKE_PASSWORD    — test user password
 *
 * Run:
 *   pnpm --filter web test:e2e
 *
 * Skip conditions:
 *   - Any of the three env vars above is missing → test.skip()
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';
const SMOKE_EMAIL = process.env['E2E_SMOKE_EMAIL'];
const SMOKE_PASSWORD = process.env['E2E_SMOKE_PASSWORD'];

// Cognito Hosted UI HTML form selectors (AWS default theme)
const HOSTED_UI = {
  usernameInput: 'input[name=username]',
  passwordInput: 'input[name=password]',
  submitButton: 'input[name=signInSubmitButton]',
} as const;

test.describe('Cognito Hosted UI auth flow', () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    if (!SMOKE_EMAIL || !SMOKE_PASSWORD) {
      testInfo.skip(true, 'E2E_SMOKE_EMAIL / E2E_SMOKE_PASSWORD not set — skipping Cognito E2E');
    }
  });

  test('login via Hosted UI → lands on /dashboard with session cookie', async ({ page }) => {
    // ── Step 1: Navigate to login page ────────────────────────────────────
    await page.goto(`${BASE_URL}/login`);
    await expect(page).toHaveURL(/\/login/);

    // ── Step 2: Click SSO button → authorize-url → redirect to Hosted UI ──
    const ssoButton = page.getByRole('button', { name: 'Continue with Google' });
    await expect(ssoButton).toBeVisible();

    // Wait for navigation away from the app (to Cognito domain)
    const [hostedUiPage] = await Promise.all([
      // After window.location.href redirect, the current page navigates
      page.waitForURL(/\.amazoncognito\.com\//, { timeout: 15_000 }),
      ssoButton.click(),
    ]);

    // hostedUiPage is undefined because it's in-page navigation; `page` is now on Cognito domain
    void hostedUiPage; // suppress unused warning

    // ── Step 3: Fill Cognito Hosted UI form ───────────────────────────────
    await page.waitForSelector(HOSTED_UI.usernameInput, { timeout: 15_000 });
    await page.fill(HOSTED_UI.usernameInput, SMOKE_EMAIL!);
    await page.fill(HOSTED_UI.passwordInput, SMOKE_PASSWORD!);
    await page.click(HOSTED_UI.submitButton);

    // ── Step 4: Wait for callback redirect → /dashboard ───────────────────
    // Cognito → /api/auth/callback → 302 → /dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // ── Step 5: Assertions ────────────────────────────────────────────────
    await expect(page).toHaveURL(/\/dashboard/);

    // Session cookie must be set (cb_access is HttpOnly → check via cookies API)
    const cookies = await page.context().cookies(BASE_URL);
    const accessCookie = cookies.find((c) => c.name === 'cb_access');
    expect(accessCookie, 'cb_access session cookie should be present').toBeDefined();
    expect(accessCookie?.httpOnly).toBe(true);
  });

  test('unauthenticated access to /dashboard redirects to /login', async ({ page }) => {
    // Clear any existing session
    await page.context().clearCookies();

    await page.goto(`${BASE_URL}/dashboard`);

    // Should be redirected to login (middleware enforces auth)
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
