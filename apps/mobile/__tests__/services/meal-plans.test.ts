// meal-plans service 데이터 레이어 — generate / credits / poll 단위 검증.
// 실제 authedFetch 경로를 그대로 태우고 globalThis.fetch 만 스파이한다.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import {
  generateMealPlan,
  getMealPlanCredits,
  pollMealPlanUntilReady,
  MealPlanPollError,
} from '../../src/services/meal-plans';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';
import { ApiError } from '../../src/lib/api-client';

const PLAN_ID = '01927000-0000-7000-8000-000000000010';
const BASE_DIET_ID = '01927000-0000-7000-8000-000000000020';

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function detail(status: string): Record<string, unknown> {
  return { id: PLAN_ID, status, daily_plans: [] };
}

describe('meal-plans service', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPendingRefresh();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('generateMealPlan', () => {
    it('POST /api/meal-plans 로 생성 요청 → 201 echo 파싱', async () => {
      fetchSpy.mockResolvedValue(
        makeResponse(201, {
          id: PLAN_ID,
          status: 'queued',
          estimated_completion_sec: 30,
          poll_url: `/meal-plans/${PLAN_ID}`,
          ws_channel: `mealplan:${PLAN_ID}`,
        }),
      );

      const res = await generateMealPlan({ base_diet_id: BASE_DIET_ID, duration_days: 3 });

      expect(res.id).toBe(PLAN_ID);
      expect(res.status).toBe('queued');
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3000/api/meal-plans');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({
        base_diet_id: BASE_DIET_ID,
        duration_days: 3,
      });
    });

    it('429 (크레딧 부족) → ApiError throw', async () => {
      fetchSpy.mockResolvedValue(
        makeResponse(429, { error: { code: 'PLAN_LIMIT_REACHED', message: 'no credits' } }),
      );
      await expect(
        generateMealPlan({ base_diet_id: BASE_DIET_ID, duration_days: 1 }),
      ).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('getMealPlanCredits', () => {
    it('GET /api/meal-plans/credits → 파싱', async () => {
      fetchSpy.mockResolvedValue(
        makeResponse(200, {
          tier: 'premium',
          credits_remaining: 14,
          credits_total: 15,
          credits_reset_at: '2026-06-01T00:00:00.000Z',
        }),
      );

      const res = await getMealPlanCredits();

      expect(res.tier).toBe('premium');
      expect(res.credits_remaining).toBe(14);
      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toBe('http://localhost:3000/api/meal-plans/credits');
    });

    it('free tier → credits_reset_at null 허용', async () => {
      fetchSpy.mockResolvedValue(
        makeResponse(200, {
          tier: 'free',
          credits_remaining: 3,
          credits_total: 3,
          credits_reset_at: null,
        }),
      );

      const res = await getMealPlanCredits();

      expect(res.credits_reset_at).toBeNull();
    });
  });

  describe('pollMealPlanUntilReady', () => {
    it('generating → active 전이 시 완성 detail 반환', async () => {
      fetchSpy
        .mockResolvedValueOnce(makeResponse(200, detail('generating')))
        .mockResolvedValueOnce(makeResponse(200, detail('active')));

      const res = await pollMealPlanUntilReady(PLAN_ID, { intervalMs: 1, maxAttempts: 5 });

      expect(res.status).toBe('active');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('failed terminal → MealPlanPollError(reason=failed)', async () => {
      fetchSpy.mockResolvedValue(makeResponse(200, detail('failed')));

      const err = await pollMealPlanUntilReady(PLAN_ID, { intervalMs: 1, maxAttempts: 5 }).catch(
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(MealPlanPollError);
      expect((err as MealPlanPollError).reason).toBe('failed');
      expect((err as MealPlanPollError).lastStatus).toBe('failed');
      // failed 는 첫 폴링에서 즉시 종료 — 추가 폴링 없음.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('maxAttempts 소진 → MealPlanPollError(reason=timeout)', async () => {
      // 매 폴링마다 fresh Response — Response body 는 1회만 read 가능.
      fetchSpy.mockImplementation(() =>
        Promise.resolve(makeResponse(200, detail('generating'))),
      );

      const err = await pollMealPlanUntilReady(PLAN_ID, { intervalMs: 1, maxAttempts: 2 }).catch(
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(MealPlanPollError);
      expect((err as MealPlanPollError).reason).toBe('timeout');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
