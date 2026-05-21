// Meal plans BFF data layer — Plan tab list/detail + credit-metered generation.
//
// Endpoints (all via BFF, Bearer auto-attached by authedFetch):
//   - GET  /api/meal-plans            — 본인 plan list (cursor pagination)
//   - GET  /api/meal-plans/:id        — detail (daily_plans + meals + narrative + citations)
//   - GET  /api/meal-plans/credits    — 생성 크레딧 잔량 (1 credit = 1 day)
//   - POST /api/meal-plans            — N일 plan 생성 (BFF 가 /meal-plans/generate 로 매핑)
//
// 생성은 비동기다: POST 가 {id, status:'queued', ...} 를 즉시 반환하고 worker 가
// LLM 파이프라인을 돈다. 호출자는 pollMealPlanUntilReady 로 terminal 상태까지 폴링.

import { schemas } from '@celebbase/shared-types';
import type { MealPlanStatus } from '@celebbase/shared-types';

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

/**
 * 식단 생성 트리거. 1 credit = 1 day — duration_days 만큼 크레딧 소비.
 * 크레딧 부족 시 엔진이 429 (PLAN_LIMIT_REACHED) → ApiError throw (상위 게이트가 처리).
 *
 * 반환은 accept-time echo ({id, status:'queued', ...}). 실제 완성은
 * pollMealPlanUntilReady 로 확인.
 *
 * @throws ApiError BFF 4xx (429 크레딧 부족 포함) / 5xx
 */
export async function generateMealPlan(
  req: schemas.GenerateMealPlanRequest,
): Promise<schemas.GenerateMealPlanResponse> {
  const raw = await authedFetch<unknown>('/api/meal-plans', {
    method: 'POST',
    body: req,
  });
  return schemas.GenerateMealPlanResponseSchema.parse(raw);
}

/**
 * 생성 크레딧 잔량 조회. credits_remaining/credits_total 은 unlimited admin
 * override 일 때만 null — 일반 free/premium/elite 는 유한 캡. credits_reset_at
 * 은 paid tier 의 다음 월 리셋(UTC), free 는 lifetime grant 라 null.
 *
 * @throws ApiError BFF 4xx/5xx
 */
export async function getMealPlanCredits(): Promise<schemas.MealPlanCreditsResponse> {
  const raw = await authedFetch<unknown>('/api/meal-plans/credits');
  return schemas.MealPlanCreditsResponseSchema.parse(raw);
}

// status 분류 — 웹 useMealPlanStream 의 폴링 종료 규칙과 동일하게 유지.
const PENDING_STATUSES: ReadonlySet<MealPlanStatus> = new Set<MealPlanStatus>([
  'queued',
  'generating',
]);
const READY_STATUSES: ReadonlySet<MealPlanStatus> = new Set<MealPlanStatus>([
  'draft',
  'completed',
  'active',
]);

/**
 * 폴링 종료가 success 가 아닐 때 throw 되는 에러.
 *   - reason 'failed': plan 이 failed/expired/archived 등 비-success terminal 도달
 *     (failed 면 엔진이 크레딧 환불 — status<>failed 회계).
 *   - reason 'timeout': maxAttempts 안에 terminal 미도달 (plan 은 계속 진행 중일 수 있음).
 */
export class MealPlanPollError extends Error {
  readonly reason: 'failed' | 'timeout';
  readonly mealPlanId: string;
  readonly lastStatus: MealPlanStatus | null;

  constructor(
    reason: 'failed' | 'timeout',
    mealPlanId: string,
    lastStatus: MealPlanStatus | null,
  ) {
    const statusSuffix = lastStatus !== null ? ` (status=${lastStatus})` : '';
    super(`meal plan ${mealPlanId} ${reason}${statusSuffix}`);
    this.name = 'MealPlanPollError';
    this.reason = reason;
    this.mealPlanId = mealPlanId;
    this.lastStatus = lastStatus;
  }
}

export interface PollMealPlanOptions {
  /** 최대 폴링 횟수. default 20. */
  maxAttempts?: number;
  /** 폴링 간격(ms). default 2000. */
  intervalMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 생성 직후 받은 id 를 terminal 상태까지 폴링한다.
 *   - draft/completed/active → 완성된 detail 반환
 *   - failed/expired/archived → MealPlanPollError('failed')
 *   - maxAttempts 소진 → MealPlanPollError('timeout')
 *
 * 마지막 시도 뒤에는 delay 하지 않는다 (불필요한 대기 제거).
 *
 * @throws MealPlanPollError | ApiError (detail fetch 4xx/5xx)
 */
export async function pollMealPlanUntilReady(
  id: string,
  options: PollMealPlanOptions = {},
): Promise<schemas.MealPlanDetailResponse> {
  const maxAttempts = options.maxAttempts ?? 20;
  const intervalMs = options.intervalMs ?? 2000;

  let lastStatus: MealPlanStatus | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const plan = await getMealPlan(id);
    lastStatus = plan.status;
    if (READY_STATUSES.has(plan.status)) {
      return plan;
    }
    if (!PENDING_STATUSES.has(plan.status)) {
      throw new MealPlanPollError('failed', id, plan.status);
    }
    if (attempt < maxAttempts - 1) {
      await delay(intervalMs);
    }
  }
  throw new MealPlanPollError('timeout', id, lastStatus);
}
