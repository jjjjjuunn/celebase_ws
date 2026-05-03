/**
 * LLM 개인화 식단 E2E — IMPL-APP-005-d
 *
 * Prerequisites (operator must set before running):
 *   PLAYWRIGHT_BASE_URL      — running Next.js instance (e.g. http://localhost:3000)
 *   E2E_LLM_EMAIL            — test user email (dev mode)
 *   E2E_LLM_PASSWORD         — test user password
 *   E2E_LLM_PLAN_ID          — existing plan ID with mode=llm (skip full generation flow)
 *   E2E_STANDARD_PLAN_ID     — (optional) existing plan ID with mode=standard for banner test
 *
 * Run:
 *   pnpm --filter web test:e2e -- --grep "LLM 개인화"
 *
 * Skip conditions:
 *   - E2E_LLM_EMAIL / E2E_LLM_PASSWORD missing → both tests skip
 *   - E2E_LLM_PLAN_ID missing → LLM badge test skips
 *   - E2E_STANDARD_PLAN_ID missing → standard banner test skips
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';
const LLM_EMAIL = process.env['E2E_LLM_EMAIL'];
const LLM_PASSWORD = process.env['E2E_LLM_PASSWORD'];
const LLM_PLAN_ID = process.env['E2E_LLM_PLAN_ID'];
const STANDARD_PLAN_ID = process.env['E2E_STANDARD_PLAN_ID'];

async function loginDev(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|onboarding|plans)/, { timeout: 15_000 });
}

test.describe('LLM 개인화 식단 — /plans/[id] rendering', () => {
  test('LLM mode — narrative + citation chips + LLM 개인화 badge visible', async ({ page }, testInfo) => {
    if (!LLM_EMAIL || !LLM_PASSWORD) {
      testInfo.skip(true, 'E2E_LLM_EMAIL / E2E_LLM_PASSWORD not set — skipping LLM E2E');
      return;
    }
    if (!LLM_PLAN_ID) {
      testInfo.skip(true, 'E2E_LLM_PLAN_ID not set — skipping LLM plan rendering test');
      return;
    }

    await loginDev(page, LLM_EMAIL, LLM_PASSWORD);

    await page.goto(`${BASE_URL}/plans/${LLM_PLAN_ID}`);

    // LLM 개인화 배지
    const llmBadge = page.locator('[aria-label="LLM AI로 개인화된 식단입니다."]');
    await expect(llmBadge).toBeVisible({ timeout: 10_000 });

    // Citation chip list — at least one list present
    const citationLists = page.locator('[role="list"]');
    await expect(citationLists.first()).toBeVisible({ timeout: 10_000 });

    // Narrative paragraph — at least one present inside a meal row
    const narrativePara = page.locator('li p').first();
    await expect(narrativePara).not.toBeEmpty({ timeout: 10_000 });

    // No console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.waitForTimeout(500);
    expect(consoleErrors, 'No console errors expected').toHaveLength(0);
  });

  test('standard mode — info banner visible with correct copy', async ({ page }, testInfo) => {
    if (!LLM_EMAIL || !LLM_PASSWORD) {
      testInfo.skip(true, 'E2E_LLM_EMAIL / E2E_LLM_PASSWORD not set — skipping standard banner E2E');
      return;
    }
    if (!STANDARD_PLAN_ID) {
      testInfo.skip(true, 'E2E_STANDARD_PLAN_ID not set — skipping standard mode banner test');
      return;
    }

    await loginDev(page, LLM_EMAIL, LLM_PASSWORD);

    await page.goto(`${BASE_URL}/plans/${STANDARD_PLAN_ID}`);

    // standard mode info banner (role="status" aria-live="polite")
    const banner = page.getByRole('status');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText('자세한 맞춤 분석이 진행되는 동안');

    // 기본 식단 배지
    const stdBadge = page.locator('[aria-label="추천 기본 식단입니다."]');
    await expect(stdBadge).toBeVisible({ timeout: 10_000 });
  });

  test('full generation flow — /plans/new → /plans/[id] mode badge present (slow)', async ({ page }, testInfo) => {
    if (!LLM_EMAIL || !LLM_PASSWORD) {
      testInfo.skip(true, 'E2E_LLM_EMAIL / E2E_LLM_PASSWORD not set — skipping full generation E2E');
      return;
    }

    await loginDev(page, LLM_EMAIL, LLM_PASSWORD);

    // Navigate to plan generation (celebrity must be pre-selected or use default)
    await page.goto(`${BASE_URL}/plans/new`);

    // Wait for WS progress to complete and auto-redirect to /plans/[id]
    await page.waitForURL(/\/plans\/[^/]+$/, { timeout: 90_000 });

    // Either mode badge must be visible
    const llmBadge = page.locator('[aria-label="LLM AI로 개인화된 식단입니다."]');
    const stdBadge = page.locator('[aria-label="추천 기본 식단입니다."]');
    const hasBadge =
      (await llmBadge.count()) > 0 || (await stdBadge.count()) > 0;
    expect(hasBadge, 'Mode badge (LLM or standard) should be visible after plan generation').toBe(true);

    // If LLM mode, check citation list presence
    if ((await llmBadge.count()) > 0) {
      const citationLists = page.locator('[role="list"]');
      await expect(citationLists.first()).toBeVisible({ timeout: 5_000 });
    }
  });
});
