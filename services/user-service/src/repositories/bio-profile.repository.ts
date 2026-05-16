import type pg from 'pg';
import type {
  BioProfile,
  Biomarkers,
  ExerciseSession,
  GoalPace,
  MacroTargets,
} from '@celebbase/shared-types';
import type { PhiKeyProvider } from '@celebbase/service-core';
import { encryptJson, decryptJson } from '@celebbase/service-core';

/** Raw DB row where PHI fields are encrypted base64 TEXT. */
interface BioProfileRow extends Omit<BioProfile, 'biomarkers' | 'medical_conditions' | 'medications'> {
  biomarkers: string | null;
  medical_conditions: string | null;
  medications: string | null;
}

async function decryptRow(
  keyProvider: PhiKeyProvider,
  row: BioProfileRow,
): Promise<BioProfile> {
  const [biomarkers, medicalConditions, medications] = await Promise.all([
    row.biomarkers
      ? decryptJson<Biomarkers>(keyProvider, row.user_id, row.biomarkers)
      : ({} as Biomarkers),
    row.medical_conditions
      ? decryptJson<string[]>(keyProvider, row.user_id, row.medical_conditions)
      : ([] as string[]),
    row.medications
      ? decryptJson<string[]>(keyProvider, row.user_id, row.medications)
      : ([] as string[]),
  ]);

  return {
    ...row,
    biomarkers,
    medical_conditions: medicalConditions,
    medications,
  };
}

export async function findByUserId(
  pool: pg.Pool,
  userId: string,
  keyProvider: PhiKeyProvider,
): Promise<BioProfile | null> {
  const { rows } = await pool.query<BioProfileRow>(
    'SELECT * FROM bio_profiles WHERE user_id = $1 LIMIT 1',
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return decryptRow(keyProvider, row);
}

type UpsertData = {
  birth_year?: number | null | undefined;
  sex?: string | null | undefined;
  height_cm?: number | null | undefined;
  weight_kg?: number | null | undefined;
  waist_cm?: number | null | undefined;
  body_fat_pct?: number | null | undefined;
  activity_level?: string | null | undefined;
  sleep_hours_avg?: number | null | undefined;
  stress_level?: string | null | undefined;
  allergies?: string[] | undefined;
  intolerances?: string[] | undefined;
  medical_conditions?: string[] | undefined;
  medications?: string[] | undefined;
  biomarkers?: Record<string, unknown> | undefined;
  primary_goal?: string | null | undefined;
  secondary_goals?: string[] | undefined;
  exercise_sessions?: ExerciseSession[] | undefined;
  goal_pace?: GoalPace | undefined;
  diet_type?: string | null | undefined;
  cuisine_preferences?: string[] | undefined;
  disliked_ingredients?: string[] | undefined;
};

export async function upsert(
  pool: pg.Pool,
  userId: string,
  data: UpsertData,
  keyProvider: PhiKeyProvider,
): Promise<BioProfile> {
  const [encMedicalConditions, encMedications, encBiomarkers] = await Promise.all([
    encryptJson(keyProvider, userId, data.medical_conditions ?? []),
    encryptJson(keyProvider, userId, data.medications ?? []),
    encryptJson(keyProvider, userId, data.biomarkers ?? {}),
  ]);

  const { rows } = await pool.query<BioProfileRow>(
    `INSERT INTO bio_profiles (
       user_id, birth_year, sex, height_cm, weight_kg, waist_cm, body_fat_pct,
       activity_level, sleep_hours_avg, stress_level,
       allergies, intolerances, medical_conditions, medications, biomarkers,
       primary_goal, secondary_goals, diet_type, cuisine_preferences, disliked_ingredients,
       exercise_sessions, goal_pace
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
       $21::jsonb, $22
     )
     ON CONFLICT (user_id) DO UPDATE SET
       birth_year            = EXCLUDED.birth_year,
       sex                   = EXCLUDED.sex,
       height_cm             = EXCLUDED.height_cm,
       weight_kg             = EXCLUDED.weight_kg,
       waist_cm              = EXCLUDED.waist_cm,
       body_fat_pct          = EXCLUDED.body_fat_pct,
       activity_level        = EXCLUDED.activity_level,
       sleep_hours_avg       = EXCLUDED.sleep_hours_avg,
       stress_level          = EXCLUDED.stress_level,
       allergies             = EXCLUDED.allergies,
       intolerances          = EXCLUDED.intolerances,
       medical_conditions    = EXCLUDED.medical_conditions,
       medications           = EXCLUDED.medications,
       biomarkers            = EXCLUDED.biomarkers,
       primary_goal          = EXCLUDED.primary_goal,
       secondary_goals       = EXCLUDED.secondary_goals,
       diet_type             = EXCLUDED.diet_type,
       cuisine_preferences   = EXCLUDED.cuisine_preferences,
       disliked_ingredients  = EXCLUDED.disliked_ingredients,
       exercise_sessions     = EXCLUDED.exercise_sessions,
       goal_pace             = EXCLUDED.goal_pace,
       updated_at            = NOW(),
       version               = bio_profiles.version + 1
     RETURNING *`,
    [
      userId,
      data.birth_year ?? null,
      data.sex ?? null,
      data.height_cm ?? null,
      data.weight_kg ?? null,
      data.waist_cm ?? null,
      data.body_fat_pct ?? null,
      data.activity_level ?? null,
      data.sleep_hours_avg ?? null,
      data.stress_level ?? null,
      data.allergies ?? [],
      data.intolerances ?? [],
      encMedicalConditions,
      encMedications,
      encBiomarkers,
      data.primary_goal ?? null,
      data.secondary_goals ?? [],
      data.diet_type ?? null,
      data.cuisine_preferences ?? [],
      data.disliked_ingredients ?? [],
      JSON.stringify(data.exercise_sessions ?? []),
      data.goal_pace ?? 'moderate',
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('BioProfile not found after upsert');
  return decryptRow(keyProvider, row);
}

export async function updateCalculated(
  pool: pg.Pool,
  userId: string,
  calculated: { bmr_kcal: number; tdee_kcal: number; target_kcal: number; macro_targets: MacroTargets },
  keyProvider: PhiKeyProvider,
): Promise<BioProfile> {
  const { rows } = await pool.query<BioProfileRow>(
    `UPDATE bio_profiles
     SET bmr_kcal = $2, tdee_kcal = $3, target_kcal = $4, macro_targets = $5, updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [
      userId,
      calculated.bmr_kcal,
      calculated.tdee_kcal,
      calculated.target_kcal,
      JSON.stringify(calculated.macro_targets),
    ],
  );
  const updated = rows[0];
  if (!updated) throw new Error('BioProfile not found after update');
  return decryptRow(keyProvider, updated);
}
