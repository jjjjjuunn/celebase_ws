// 현재 사용자의 subscription tier 를 가져오는 React hook.
//
// 호출 시점: ClaimsFeedScreen mount, tier-aware UI 가 필요한 모든 곳.
// fallback: 호출 실패 시 'free' — fail-closed (잠금 더 엄격하게).

import { useEffect, useState } from 'react';
import type { SubscriptionTier } from '@celebbase/shared-types';

import { getCurrentSubscription, tierFromSubscription } from '../services/subscriptions';

export interface CurrentTierState {
  tier: SubscriptionTier;
  loading: boolean;
  /** 외부에서 paywall 닫힌 후 호출 — 새 tier fetch. */
  refresh: () => void;
}

export function useCurrentTier(): CurrentTierState {
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getCurrentSubscription()
      .then((res) => {
        if (cancelled) return;
        setTier(tierFromSubscription(res));
        setLoading(false);
      })
      .catch(() => {
        // 호출 실패 시 fail-closed — 'free' 유지. 콘텐츠 잠금이 엄격하게 적용되어
        // 결제 검증 안 된 user 가 premium 콘텐츠 우회 진입 못 함.
        if (cancelled) return;
        setTier('free');
        setLoading(false);
      });

    return (): void => {
      cancelled = true;
    };
  }, [version]);

  return {
    tier,
    loading,
    refresh: () => {
      setVersion((v) => v + 1);
    },
  };
}

/**
 * Premium 잠금 룰: trust_grade A/B + free tier = locked.
 *
 * 근거: trust grade A/B = 최고 신뢰 콘텐츠 — premium 가치 제안의 핵심.
 * C/D/E 는 free user 도 접근 가능 (teaser).
 *
 * BE 가 향후 `is_premium: boolean` 필드 추가하면 본 함수의 trust_grade 분기를
 * 교체. 별도 PR (`packages/shared-types` + content-service 스키마 변경).
 */
export function isClaimLocked(
  trustGrade: string,
  userTier: SubscriptionTier,
): boolean {
  if (userTier !== 'free') return false;
  return trustGrade === 'A' || trustGrade === 'B';
}
