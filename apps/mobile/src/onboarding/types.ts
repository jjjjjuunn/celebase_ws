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

import type { ActivityLevel, PrimaryGoal, DietType } from '@celebbase/shared-types';

/**
 * S5 Activity & Health — PHI 첫 도입.
 * spec.md §9.3 의 PHI 정의: medical_conditions / medications / biomarkers.
 * allergies / intolerances 는 비-PHI 로 분류되지만 사용자 입력 정보라 동일 화면.
 *
 * **PHI 안전 의무** (호출자 책임):
 * 1. 일반 로그 / stdout 어느 채널로도 medical_conditions / medications
 *    값을 출력하지 않는다.
 * 2. AsyncStorage 등 평문 영속화 금지 — SecureStore 필수 또는 in-memory only.
 * 3. POST 외 endpoint 에 절대 전송 금지 (특히 persona-match 류, spec.md §7.1).
 */
export type ActivityHealthDraft = {
  activity_level: ActivityLevel;
  allergies: string[]; // 비-PHI
  medical_conditions: string[]; // ⚠ PHI
  medications: string[]; // ⚠ PHI
};

/**
 * S6 Goals & Diet Prefs — 비-PHI.
 */
export type GoalsDraft = {
  primary_goal: PrimaryGoal;
  secondary_goals: string[];
  diet_type: DietType | null; // null = 미선택 (omnivore 가 default 아님)
};

/**
 * 온보딩 전체 (S2~S7) 완성 결과. S7 최종 POST 시 사용.
 */
export type OnboardingDraftComplete = OnboardingDraftS2S4 & {
  activityHealth: ActivityHealthDraft;
  goals: GoalsDraft;
};
