// bio-profile BFF write path — 온보딩 S7 최종 POST 의 통로.
// spec.md §9.3 PHI 정책 정합:
//   - PHI 필드 (medical_conditions / medications / biomarkers) 는 BE 가 AES-256
//     암호화 + audit log (phi_access_logs WRITE) 처리.
//   - mobile 책임: 정확한 사용자 입력 그대로 단일 POST 로 전송. 다른 endpoint
//     (persona-match 등) 에 PHI 절대 포함 금지.
//   - fail-closed: 5xx 시 사용자에게 명확한 에러 + 재시도 가능, 절대 silent
//     fallback 금지 (감사 로그 실패 시 BE 가 500 반환, 그대로 노출).

import { schemas } from '@celebbase/shared-types';

import { authedFetch } from '../lib/fetch-with-refresh';
import { feetInchesToCm, lbToKg } from '../lib/units';
import type { OnboardingDraft } from '../onboarding/types';

/**
 * 온보딩 완성 draft → bio-profile POST request body 매핑.
 *
 * 필수 필드가 미설정이면 null 반환 (방어적 — wizard 가 각 step 을 게이트하므로
 * 실제로는 발생하지 않음). 호출자(OnboardingFlow)가 null 가드 후 reveal 진입.
 *
 * 데이터 최소화 + launch-v1 PHI 제거 (IMPL-PHI-LAUNCH-V1-REMOVAL-001):
 * medical_conditions + medications 는 launch 에서 항상 [] (미수집 — Apple
 * 5.1.3 / GDPR Art.9, post-BAA 재도입). imperial(ft/in/lb) → metric(cm/kg)
 * 변환은 여기서 일괄 수행.
 */
export function buildBioProfileBody(
  draft: OnboardingDraft,
): schemas.CreateBioProfileRequest | null {
  const { birth_year, sex, height_ft, height_in, weight_lb, activity_level, primary_goal } = draft;
  if (
    birth_year === undefined ||
    sex === undefined ||
    height_ft === undefined ||
    height_in === undefined ||
    weight_lb === undefined ||
    activity_level === undefined ||
    primary_goal === undefined
  ) {
    return null;
  }
  return {
    birth_year,
    sex,
    height_cm: feetInchesToCm(height_ft, height_in),
    weight_kg: lbToKg(weight_lb),
    activity_level,
    allergies: draft.allergies,
    medical_conditions: [],
    medications: [],
    primary_goal,
    secondary_goals: draft.secondary_goals,
    ...(draft.diet_type !== null ? { diet_type: draft.diet_type } : {}),
  };
}

/**
 * bio-profile POST. 인증 필수 (Bearer). PHI 포함.
 *
 * @throws ApiError 4xx (validation) / 5xx (audit log fail-closed 등)
 */
export async function saveBioProfile(
  body: schemas.CreateBioProfileRequest,
): Promise<schemas.BioProfileResponse> {
  const raw = await authedFetch<unknown>('/api/users/me/bio-profile', {
    method: 'POST',
    body,
  });
  return schemas.BioProfileResponseSchema.parse(raw);
}

/**
 * bio-profile 조회. 온보딩 완료 여부의 서버 진실(source of truth) —
 * 식단 생성 게이트(3-state)가 이 결과로 "온보딩 완료 vs 미완료" 를 판정한다.
 *
 * 프로필이 없으면 BE 가 NotFoundError → 404 → ApiError(404) throw.
 * 호출자(게이트)는 404 를 "미온보딩" 신호로 catch 한다.
 *
 * @throws ApiError 404 (프로필 부재 = 미온보딩) / 그 외 4xx·5xx
 */
export async function getBioProfile(): Promise<schemas.BioProfileResponse> {
  const raw = await authedFetch<unknown>('/api/users/me/bio-profile');
  return schemas.BioProfileResponseSchema.parse(raw);
}
