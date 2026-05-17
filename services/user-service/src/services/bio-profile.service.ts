import type pg from 'pg';
import type { BioProfile, MacroTargets } from '@celebbase/shared-types';
import { NotFoundError } from '@celebbase/service-core';
import type { PhiKeyProvider } from '@celebbase/service-core';
import * as bioProfileRepo from '../repositories/bio-profile.repository.js';

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// body_fat_pct DB CHECK constraint (0001_initial-schema.sql:64) 와 일치하는
// 신뢰 가능 범위. 범위 밖이면 입력 오류로 간주하고 Mifflin fallback.
const BODY_FAT_PCT_MIN = 3;
const BODY_FAT_PCT_MAX = 60;
// 모든 input 부재 시 generic adult 추정값 (NUTRITION_BOUNDS 와 무관, fallback 전용).
const BMR_SAFE_FALLBACK_KCAL = 1800;

function calcBmr(profile: BioProfile): number {
  const { weight_kg, height_cm, birth_year, sex, body_fat_pct } = profile;
  if (!weight_kg) return BMR_SAFE_FALLBACK_KCAL; // Katch도 weight 필수

  // Katch-McArdle (1973) — LBM 기반 직접 계산. LBM 은 metabolic active mass 의
  // 더 직접적 predictor 이므로 body composition known 사용자에게 우월. self-reported
  // body_fat_pct 정확도는 입력 품질 의존 (DEXA > BIA > visual estimate; P2 source flag).
  if (body_fat_pct !== null && body_fat_pct >= BODY_FAT_PCT_MIN && body_fat_pct <= BODY_FAT_PCT_MAX) {
    const lbm = weight_kg * (1 - body_fat_pct / 100);
    return Math.round(370 + 21.6 * lbm);
  }

  // Mifflin-St Jeor (1990) — body_fat_pct 부재 시 일반인구 표준 추정.
  // 일반 인구 대상 가장 robust (Frankenfield DC et al., J Am Diet Assoc 2005;105(5):775-89).
  // 출처: Mifflin MD et al., Am J Clin Nutr 1990;51(2):241-7, PubMed 2305711.
  if (!height_cm || !birth_year) return BMR_SAFE_FALLBACK_KCAL;
  const age = new Date().getFullYear() - birth_year;
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  if (sex === 'male') return Math.round(base + 5);
  if (sex === 'female') return Math.round(base - 161);
  return Math.round(base - 78); // other: male/female 평균
}

/**
 * [SoT NOTE — CHORE-MEAL-TARGET-KCAL-SOT-001] Cached estimate only.
 *
 * meal-plan-engine `macro_rebalancer.rebalance_macros` 가 식단 생성 시 source of truth.
 * body composition / medications / diet_type / goal_pace 를 모두 반영한 정확 macros 를
 * 계산한다 (AMDR IOM + GLP-1 protein force 등).
 *
 * 본 함수는 카드 표시용 placeholder (legacy). 사용자에게 보이는 macros 는 식단의
 * `daily_targets` 사용을 권장. 후속 CHORE-MEAL-TARGET-KCAL-SOT-002 가 함수 자체 제거.
 *
 * Note: `@deprecated` JSDoc 미사용 — eslint `@typescript-eslint/no-deprecated` 가
 * 동일 파일 내 호출 (`recalculate`) 을 lint 에러로 catch. 실제 제거는 후속 chore.
 */
function calcMacroTargets(targetKcal: number, primaryGoal: string): MacroTargets {
  let proteinPct = 0.25;
  let carbsPct = 0.50;
  let fatPct = 0.25;

  if (primaryGoal === 'weight_loss') {
    proteinPct = 0.30; carbsPct = 0.40; fatPct = 0.30;
  } else if (primaryGoal === 'muscle_gain') {
    proteinPct = 0.35; carbsPct = 0.45; fatPct = 0.20;
  }

  return {
    protein_g: Math.round((targetKcal * proteinPct) / 4),
    carbs_g: Math.round((targetKcal * carbsPct) / 4),
    fat_g: Math.round((targetKcal * fatPct) / 9),
    fiber_g: 30,
  };
}

export async function getBioProfile(
  pool: pg.Pool,
  userId: string,
  keyProvider: PhiKeyProvider,
): Promise<BioProfile> {
  const profile = await bioProfileRepo.findByUserId(pool, userId, keyProvider);
  if (!profile) throw new NotFoundError('Bio profile not found');
  return profile;
}

export async function createOrUpdateBioProfile(
  pool: pg.Pool,
  userId: string,
  data: Parameters<typeof bioProfileRepo.upsert>[2],
  keyProvider: PhiKeyProvider,
): Promise<BioProfile> {
  await bioProfileRepo.upsert(pool, userId, data, keyProvider);
  return recalculate(pool, userId, keyProvider);
}

/**
 * Recalculate BMR/TDEE 및 cached target_kcal/macros estimate.
 *
 * **SoT 정책 (CHORE-MEAL-TARGET-KCAL-SOT-001)**:
 * - `bmr_kcal` + `tdee_kcal` = user-service single source of truth (P1-B Mifflin/Katch
 *   dispatch). engine 도 동일 cached 값 사용 (재계산 X).
 * - `target_kcal` + `macro_targets` = **placeholder estimate only**. 식단 생성용 실제
 *   값은 meal-plan-engine 의 `calorie_adjuster.adjust_calories` (P1-C goal_pace 분기) +
 *   `macro_rebalancer.rebalance_macros` (AMDR + medications + diet_type) 가 SoT.
 *
 * 현재 user-service 의 `target_kcal = tdee - 500` (절대 deficit) 은 engine 의
 * `tdee × goal_pace_factor` (e.g. weight_loss × 0.75 = 25% deficit) 와 결과 다름:
 * tdee=2500 시 user-service 2000 vs engine aggressive 1875. 사용자에게 보이는 카드
 * 숫자는 식단 결과 (`daily_targets`) 사용 권장 — 후속 PR 에서 FE fallback 갱신.
 *
 * 본 함수는 backward-compat 위해 estimate 계속 저장. 후속 chore (CHORE-MEAL-TARGET
 * -KCAL-SOT-002) 가 user-service 측 target_kcal/macros null 저장 + FE 변경.
 */
export async function recalculate(
  pool: pg.Pool,
  userId: string,
  keyProvider: PhiKeyProvider,
): Promise<BioProfile> {
  const profile = await getBioProfile(pool, userId, keyProvider);

  const bmr = calcBmr(profile);
  const multiplier = profile.activity_level
    ? (ACTIVITY_MULTIPLIERS[profile.activity_level] ?? 1.55)
    : 1.55;
  const tdee = Math.round(bmr * multiplier);

  // [DEPRECATED estimate] 실제 식단 target_kcal 은 engine SoT. 카드 표시용 placeholder.
  let targetKcal = tdee;
  if (profile.primary_goal === 'weight_loss') targetKcal = tdee - 500;
  else if (profile.primary_goal === 'muscle_gain') targetKcal = tdee + 300;

  // Clamp to safe range (spec §5 AI engine NUTRITION_BOUNDS)
  targetKcal = Math.max(1200, Math.min(5000, targetKcal));

  const macroTargets = calcMacroTargets(targetKcal, profile.primary_goal ?? 'maintenance');

  return bioProfileRepo.updateCalculated(pool, userId, {
    bmr_kcal: bmr,
    tdee_kcal: tdee,
    target_kcal: targetKcal,
    macro_targets: macroTargets,
  }, keyProvider);
}
