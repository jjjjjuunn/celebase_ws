// Onboarding draft state — 7단계 wizard 의 in-memory state shape.
// 본 task (M4 sub-task 1) 는 S2~S4 만 채운다. S5~S7 는 후속 sub-task.
//
// PHI 정책: 본 type 에는 PHI 필드 (medical_conditions / medications /
// biomarkers) 가 없다 — 후속 S5 sub-task 에서 별도 type 으로 분리하여 secure
// 저장소 (SecureStore) 와 비-PHI (AsyncStorage 또는 메모리) 의 경계를 명확히 한다.

import type { Sex } from '@celebbase/shared-types';

/**
 * S2 Persona Select 결과 — 셀럽 slug (BE 가 user record 에 저장하는 외부 key).
 */
export type PersonaDraft = {
  preferred_celebrity_slug: string;
};

/**
 * S3 Basic Info — display_name 은 user record, birth_year / sex 는 bio-profile
 * 의 비-PHI 필드. sex enum 은 shared-types 정합 (male/female/other/prefer_not_to_say).
 */
export type BasicInfoDraft = {
  display_name: string;
  birth_year: number; // 1920 ~ 현재년도-13 (COPPA / 한국 정보보호)
  sex: Sex;
};

/**
 * S4 Body Metrics — bio-profile 의 비-PHI 필드 (height/weight/waist).
 * 단위는 metric (cm / kg) 기본. imperial 토글은 후속 chore.
 */
export type BodyMetricsDraft = {
  height_cm: number;
  weight_kg: number;
  waist_cm?: number;
};

/**
 * 본 sub-task 의 완성 결과. App.tsx 에서 onComplete 콜백으로 받는다.
 */
export type OnboardingDraftS2S4 = {
  persona: PersonaDraft;
  basicInfo: BasicInfoDraft;
  bodyMetrics: BodyMetricsDraft;
};

// (Sex 는 @celebbase/shared-types 에서 직접 re-export 가 아닌 직접 import.)
