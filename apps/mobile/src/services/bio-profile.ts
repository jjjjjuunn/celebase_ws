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
import type { OnboardingDraftComplete } from '../onboarding/types';

/**
 * 온보딩 완성 draft → bio-profile POST request body 매핑.
 * shared-types `CreateBioProfileRequestSchema` 의 partial shape 에 맞춰 필드 선택.
 * S2 의 persona slug 는 별도 endpoint (`PATCH /api/users/me`) 영역이라
 * 본 함수는 bio-profile 필드만 다룬다.
 */
export function draftToBioProfileBody(
  draft: OnboardingDraftComplete,
): schemas.CreateBioProfileRequest {
  return {
    birth_year: draft.basicInfo.birth_year,
    sex: draft.basicInfo.sex,
    height_cm: draft.bodyMetrics.height_cm,
    weight_kg: draft.bodyMetrics.weight_kg,
    ...(draft.bodyMetrics.waist_cm !== undefined
      ? { waist_cm: draft.bodyMetrics.waist_cm }
      : {}),
    activity_level: draft.activityHealth.activity_level,
    allergies: draft.activityHealth.allergies,
    medical_conditions: draft.activityHealth.medical_conditions,
    medications: draft.activityHealth.medications,
    primary_goal: draft.goals.primary_goal,
    secondary_goals: draft.goals.secondary_goals,
    ...(draft.goals.diet_type !== null ? { diet_type: draft.goals.diet_type } : {}),
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
