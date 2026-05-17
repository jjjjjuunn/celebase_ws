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

function calcBmr(profile: BioProfile): number {
  const { weight_kg, height_cm, birth_year, sex, body_fat_pct } = profile;
  if (!weight_kg) return 1800; // safe fallback (Katch도 weight 필수)

  // Katch-McArdle (1973) — body composition 기반, 활동인구에서 Mifflin 보다 정확
  // (Frankenfield DC et al., J Am Diet Assoc 2005;105(5):775-89)
  if (body_fat_pct !== null && body_fat_pct >= BODY_FAT_PCT_MIN && body_fat_pct <= BODY_FAT_PCT_MAX) {
    const lbm = weight_kg * (1 - body_fat_pct / 100);
    return Math.round(370 + 21.6 * lbm);
  }

  // Mifflin-St Jeor (1990) — body_fat_pct 부재 시 표준
  // (Mifflin MD et al., Am J Clin Nutr 1990;51(2):241-7, PubMed 2305711)
  if (!height_cm || !birth_year) return 1800;
  const age = new Date().getFullYear() - birth_year;
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  if (sex === 'male') return Math.round(base + 5);
  if (sex === 'female') return Math.round(base - 161);
  return Math.round(base - 78); // other: average
}

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

  let targetKcal = tdee;
  if (profile.primary_goal === 'weight_loss') targetKcal = tdee - 500;
  else if (profile.primary_goal === 'muscle_gain') targetKcal = tdee + 300;

  // Clamp to safe range (spec §5 AI engine nutrition bounds)
  targetKcal = Math.max(1200, Math.min(5000, targetKcal));

  const macroTargets = calcMacroTargets(targetKcal, profile.primary_goal ?? 'maintenance');

  return bioProfileRepo.updateCalculated(pool, userId, {
    bmr_kcal: bmr,
    tdee_kcal: tdee,
    target_kcal: targetKcal,
    macro_targets: macroTargets,
  }, keyProvider);
}
