// 식단 생성 크레딧 잔량을 가져오는 React hook (use-current-tier 패턴 미러).
//
// 호출 시점: MealPlanScreen mount, 생성 완료 후 refresh.
// fail-closed: 호출 실패 시 credits = null → 상위 게이트가 "잔량 0" 으로 취급
// (검증 안 된 잔량으로 생성 우회 못 함).
//
// 주의 — null 의 두 의미를 구분할 것 (게이트가 책임):
//   - credits === null         → fetch 실패 → 생성 불가 (fail-closed).
//   - credits.credits_remaining === null → unlimited admin override → 무제한 허용.

import { useEffect, useState } from 'react';
import type { schemas } from '@celebbase/shared-types';

import { getMealPlanCredits } from '../services/meal-plans';

export interface MealPlanCreditsState {
  /** 성공 시 크레딧 응답, fetch 실패 시 null (fail-closed). */
  credits: schemas.MealPlanCreditsResponse | null;
  loading: boolean;
  /** 생성/구독 완료 후 호출 — 잔량 재fetch. */
  refresh: () => void;
}

/**
 * @param skip true 면 fetch 를 건너뛴다(credits=null, loading=false). 게스트(무토큰)에서
 *   protected `/api/meal-plans/credits` 호출 → 401 → logout boot-kick 을 회피하기 위함
 *   (IMPL-MOBILE-GUEST-NEWS-HOME-001). hook 규칙상 조건부 호출 대신 내부 no-op.
 */
export function useMealPlanCredits(skip = false): MealPlanCreditsState {
  const [credits, setCredits] = useState<schemas.MealPlanCreditsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (skip) {
      // 게스트 — protected fetch 안 함. 게이트가 credits=null 을 "잔량 0" 으로 취급.
      setCredits(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    getMealPlanCredits()
      .then((res) => {
        if (cancelled) return;
        setCredits(res);
        setLoading(false);
      })
      .catch(() => {
        // fail-closed — 잔량 미상 시 null 유지. 게이트가 0 으로 취급해 생성 차단.
        if (cancelled) return;
        setCredits(null);
        setLoading(false);
      });

    return (): void => {
      cancelled = true;
    };
  }, [version, skip]);

  return {
    credits,
    loading,
    refresh: () => {
      setVersion((v) => v + 1);
    },
  };
}
