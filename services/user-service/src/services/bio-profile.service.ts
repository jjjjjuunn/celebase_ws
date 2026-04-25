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

function calcBmr(profile: BioProfile): number {
  const { weight_kg, height_cm, birth_year, sex } = profile;
  if (!weight_kg || !height_cm || !birth_year) return 1800; // safe fallback

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
