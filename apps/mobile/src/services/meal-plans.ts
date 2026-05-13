// Meal plans BFF read — Plan tab 의 list + 단일 detail.
//
// Endpoints:
//   - GET /api/meal-plans — 사용자 본인의 meal plan list (cursor pagination)
//   - GET /api/meal-plans/:id — detail (daily_plans + meals + narrative + citations)
//
// 본 sub-task 는 list 의 가장 최근 active plan 표시까지. detail 진입 + regenerate
// 는 후속 chore.

import { schemas } from '@celebbase/shared-types';

import { authedFetch } from '../lib/fetch-with-refresh';

/**
 * 본인의 meal plan 목록 (최신 순). 첫 페이지만 사용.
 *
 * @throws ApiError BFF 4xx/5xx
 */
export async function listMyMealPlans(): Promise<schemas.MealPlanListResponse> {
  const raw = await authedFetch<unknown>('/api/meal-plans?limit=10');
  return schemas.MealPlanListResponseSchema.parse(raw);
}

/**
 * 단일 meal plan detail (daily_plans + narrative + citations).
 *
 * @throws ApiError BFF 4xx/5xx
 */
export async function getMealPlan(
  id: string,
): Promise<schemas.MealPlanDetailResponse> {
  const raw = await authedFetch<unknown>(
    `/api/meal-plans/${encodeURIComponent(id)}`,
  );
  return schemas.MealPlanDetailResponseSchema.parse(raw);
}
