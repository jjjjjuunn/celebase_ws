// Subscription tier read + RevenueCat purchase 후 BFF sync.
//
// Endpoints:
//   - GET /api/subscriptions/me — current subscription (or null = free)
//   - POST /api/subscriptions/sync — RevenueCat → commerce-service tier 동기화
//
// Flow:
//   1. App open / paywall mount → getCurrentSubscription() — tier 캐시
//   2. 사용자가 paywall 에서 패키지 선택 → purchasePackage() (RevenueCat SDK)
//   3. purchase success → syncSubscription('purchase') — BFF 가 RevenueCat REST
//      읽어서 commerce-service 통해 user.tier 갱신
//   4. 다시 getCurrentSubscription() → 새 tier 확인 후 paywall 닫고 unlocked 진입

import { z } from 'zod';
import Purchases, {
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import { schemas, type SubscriptionTier } from '@celebbase/shared-types';

import { authedFetch } from '../lib/fetch-with-refresh';
import { ApiError } from '../lib/api-client';

// ── GET /api/subscriptions/me ──────────────────────────────────────────────

/**
 * 현재 사용자의 subscription 상태를 가져온다. null = free tier.
 *
 * @throws ApiError BFF 4xx/5xx
 */
export async function getCurrentSubscription(): Promise<schemas.GetMySubscriptionResponse> {
  const raw = await authedFetch<unknown>('/api/subscriptions/me');
  return schemas.GetMySubscriptionResponseSchema.parse(raw);
}

/**
 * subscription 응답에서 tier 만 추출. null → 'free'.
 */
export function tierFromSubscription(
  res: schemas.GetMySubscriptionResponse,
): SubscriptionTier {
  if (res.subscription === null) return 'free';
  return res.subscription.tier;
}

// ── POST /api/subscriptions/sync ───────────────────────────────────────────

export type SyncSource = 'purchase' | 'app_open' | 'manual';

// route.ts 의 inline ResponseSchema 와 동일 shape. shared-types 미반영 — 본 endpoint
// 는 mobile-driven 신규 (IMPL-MOBILE-SUB-SYNC-002) 라 SubscriptionWireSchema 와 다른 thin 응답.
const SyncResponseSchema = z.object({
  user_id: z.string().uuid(),
  tier: z.enum(['free', 'premium', 'elite']),
  status: z.enum(['active', 'past_due', 'cancelled', 'expired', 'free']),
  current_period_end: z.string().nullable(),
  source: z.enum(['purchase', 'app_open', 'manual']),
});
export type SyncSubscriptionResponse = z.infer<typeof SyncResponseSchema>;

/**
 * BFF 가 RevenueCat REST 를 읽어 commerce-service 통해 user tier 를 갱신.
 *
 * `source` 의미:
 *   - 'purchase' — IAP 성공 직후 (가장 흔함)
 *   - 'app_open' — cold start / foreground 시 tier 갱신 (renewal 반영)
 *   - 'manual' — "Restore Purchases" 또는 사용자 명시적 새로고침
 *
 * Rate limit: 5/min per user (BFF 측).
 *
 * @throws ApiError BFF 4xx/5xx (특히 429 = rate limited)
 */
export async function syncSubscription(
  source: SyncSource,
): Promise<SyncSubscriptionResponse> {
  const raw = await authedFetch<unknown>('/api/subscriptions/sync', {
    method: 'POST',
    body: { source },
  });
  return SyncResponseSchema.parse(raw);
}

// ── RevenueCat SDK wrappers ────────────────────────────────────────────────

/**
 * 현재 활성 Offering (RevenueCat 대시보드에서 정의한 패키지 묶음) 을 가져온다.
 *
 * Returns null when:
 *   - Offering not yet configured in RevenueCat dashboard
 *   - Native module unavailable (Expo Go dev)
 *   - SDK 초기화 실패
 */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (err) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[subscriptions] getOfferings failed (likely Expo Go):', err);
    }
    return null;
  }
}

export interface PurchaseResult {
  tier: SubscriptionTier;
  receipt: SyncSubscriptionResponse;
}

/**
 * RevenueCat 패키지 구매 → 성공 시 BFF sync 호출 → 새 tier 반환.
 *
 * 사용자 cancel / payment failed 는 ApiError 가 아닌 일반 Error 로 throw.
 * 호출자는 try/catch 로 에러 표면화.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  // 1. RevenueCat 가 native StoreKit / Play Billing 호출
  await Purchases.purchasePackage(pkg);

  // 2. BFF 에 sync 요청 — BFF 가 RevenueCat REST 로 영수증 검증 후 commerce-service 호출
  const receipt = await syncSubscription('purchase');

  return { tier: receipt.tier, receipt };
}

/**
 * "Restore Purchases" — 사용자가 다른 디바이스에서 구매했거나 앱 재설치 시.
 * Apple Guideline 3.1.1 에 따라 paywall 에 반드시 노출되어야 함.
 */
export async function restorePurchases(): Promise<SyncSubscriptionResponse> {
  await Purchases.restorePurchases();
  return syncSubscription('manual');
}

/**
 * Helper — ApiError 인지 판별. UI 에서 사용자에게 메시지 보여주기 위한 narrowing.
 */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
