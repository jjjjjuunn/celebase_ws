// Plan 22 · Phase H1 — Day 5 WOW Moment trial recap.
// Aggregates the currently authenticated user's trial progress by fanning out
// to user-service (for created_at + preferred celebrity), meal-plan-service
// (for the active plan's future meal preview), and analytics-service (for a
// 7-day completion-rate rollup), then returns a TrialRecapResponse.
//
// MVP: trial_day is derived from users.created_at as a proxy since the
// trial_start_date column is not present on the schema (see Plan 22 Phase H).

import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import type { z } from 'zod';
import { fetchBff } from '../../_lib/bff-fetch.js';
import { createProtectedRoute, type Session } from '../../_lib/session.js';
import { toBffErrorResponse } from '../../_lib/bff-error.js';

type MealPlanWire = z.infer<typeof schemas.MealPlanWireSchema>;
type DailyPlan = MealPlanWire['daily_plans'][number];
type DailyMeal = DailyPlan['meals'][number];

const ONE_DAY_MS = 86_400_000;
const PREVIEW_LIMIT = 3;
const SUMMARY_WINDOW_DAYS = 7;
const CTA_TARGET = '/account/subscription';

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return toIsoDate(new Date());
}

function computeTrialDay(createdAtIso: string): number {
  const created = new Date(createdAtIso).getTime();
  if (Number.isNaN(created)) return 1;
  const now = Date.now();
  const diffDays = Math.floor((now - created) / ONE_DAY_MS);
  return Math.max(1, diffDays + 1);
}

function pickActivePlan(plans: MealPlanWire[]): MealPlanWire | null {
  const actives = plans.filter((p) => p.status === 'active');
  if (actives.length === 0) return null;
  actives.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  return actives[0] ?? null;
}

function extractPreview(
  plan: MealPlanWire | null,
): { date: string; meal: DailyMeal }[] {
  if (plan === null) return [];
  const today = todayIso();
  const preview: { date: string; meal: DailyMeal }[] = [];
  const upcoming = plan.daily_plans
    .filter((d) => d.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const day of upcoming) {
    for (const meal of day.meals) {
      preview.push({ date: day.date, meal });
      if (preview.length >= PREVIEW_LIMIT) return preview;
    }
  }
  return preview;
}

function blendAlignmentPct(
  summary: z.infer<typeof schemas.DailyLogSummaryResponseSchema> | null,
): number | null {
  if (summary === null || summary.total_logs === 0) return null;
  const adherence = summary.completion_rate;
  const energyNorm = summary.avg_energy_level !== null ? summary.avg_energy_level / 5 : 0.5;
  const moodNorm = summary.avg_mood !== null ? summary.avg_mood / 5 : 0.5;
  const blend = adherence * 0.7 + energyNorm * 0.15 + moodNorm * 0.15;
  return Math.round(Math.max(0, Math.min(1, blend)) * 100);
}

export const GET = createProtectedRoute(async (req: NextRequest, session: Session) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;

  const summaryStart = toIsoDate(new Date(Date.now() - (SUMMARY_WINDOW_DAYS - 1) * ONE_DAY_MS));
  const summaryEnd = todayIso();
  const summaryQuery = `start_date=${summaryStart}&end_date=${summaryEnd}`;

  const [userResult, plansResult, summaryResult] = await Promise.all([
    fetchBff('user', '/users/me', {
      method: 'GET',
      schema: schemas.UserWireSchema,
      requestId,
      forwardedFor,
      userId: session.user_id,
      authToken: session.raw_token,
    }),
    fetchBff('meal-plan', '/meal-plans?status=active&limit=1', {
      method: 'GET',
      schema: schemas.MealPlanListResponseSchema,
      requestId,
      forwardedFor,
      userId: session.user_id,
      authToken: session.raw_token,
    }),
    fetchBff('analytics', `/daily-logs/summary?${summaryQuery}`, {
      method: 'GET',
      schema: schemas.DailyLogSummaryResponseSchema,
      requestId,
      forwardedFor,
      userId: session.user_id,
      authToken: session.raw_token,
    }),
  ]);

  if (!userResult.ok) {
    return toBffErrorResponse(userResult.error, requestId);
  }

  const plan = plansResult.ok ? pickActivePlan(plansResult.data.items) : null;
  const summary = summaryResult.ok ? summaryResult.data : null;

  const payload = {
    trial_day: computeTrialDay(userResult.data.created_at),
    alignment_pct: blendAlignmentPct(summary),
    celebrity_slug: userResult.data.preferred_celebrity_slug,
    next_week_preview: extractPreview(plan),
    cta_target: CTA_TARGET,
  };

  const parsed = schemas.TrialRecapResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'UPSTREAM_SHAPE_MISMATCH',
          message: 'trial recap aggregation failed schema validation',
          requestId,
        },
      }),
      { status: 502, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }

  return new Response(JSON.stringify(parsed.data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
});
