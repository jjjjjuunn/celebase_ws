// Sprint A bio-profile wire schemas (IMPL-APP-001a-2).
//
// PHI fields (biomarkers, medical_conditions, medications) stay typed at the wire
// layer. BFF never decrypts — BE returns already-decrypted values to authorized
// callers. Logging boundary is enforced separately via `PhiRedactKeys`.

import { z } from 'zod';
import { ActivityLevel, DietType, PrimaryGoal, Sex, StressLevel } from '../enums.js';
import type { BioProfile } from '../entities.js';
import { UuidV7 } from './_utils.js';
import { BiomarkersSchema, MacroTargetsSchema } from '../jsonb/index.js';

export const BioProfileWireSchema = z.object({
  id: UuidV7,
  user_id: UuidV7,

  birth_year: z.number().int().min(1900).max(2100).nullable(),
  sex: Sex.nullable(),
  height_cm: z.number().min(0).nullable(),
  weight_kg: z.number().min(0).nullable(),
  waist_cm: z.number().min(0).nullable(),
  body_fat_pct: z.number().min(0).max(100).nullable(),

  activity_level: ActivityLevel.nullable(),
  sleep_hours_avg: z.number().min(0).max(24).nullable(),
  stress_level: StressLevel.nullable(),

  // PHI — passes through BFF, BE returns decrypted values.
  allergies: z.array(z.string()),
  intolerances: z.array(z.string()),
  medical_conditions: z.array(z.string()),
  medications: z.array(z.string()),
  biomarkers: BiomarkersSchema,

  primary_goal: PrimaryGoal.nullable(),
  secondary_goals: z.array(z.string()),

  diet_type: DietType.nullable(),
  cuisine_preferences: z.array(z.string()),
  disliked_ingredients: z.array(z.string()),

  bmr_kcal: z.number().min(0).nullable(),
  tdee_kcal: z.number().min(0).nullable(),
  target_kcal: z.number().min(0).nullable(),
  macro_targets: MacroTargetsSchema,

  version: z.number().int().min(1),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type BioProfileWire = z.infer<typeof BioProfileWireSchema>;

export const BioProfileResponseSchema = z.object({
  bio_profile: BioProfileWireSchema,
});
export type BioProfileResponse = z.infer<typeof BioProfileResponseSchema>;

// Partial shape — BE applies PATCH semantics (merge).
export const CreateBioProfileRequestSchema = BioProfileWireSchema.omit({
  id: true,
  user_id: true,
  version: true,
  created_at: true,
  updated_at: true,
}).partial();
export type CreateBioProfileRequest = z.infer<typeof CreateBioProfileRequestSchema>;

export const UpdateBioProfileRequestSchema = CreateBioProfileRequestSchema;
export type UpdateBioProfileRequest = z.infer<typeof UpdateBioProfileRequestSchema>;

export const DeleteBioProfileResponseSchema = z.object({
  deleted: z.literal(true),
});
export type DeleteBioProfileResponse = z.infer<typeof DeleteBioProfileResponseSchema>;

// Wire↔Row parity guard (D1): non-timestamp fields must match entities.BioProfile.
const _bioProfileWireRowParity = null as unknown as BioProfileWire satisfies {
  id: BioProfile['id'];
  user_id: BioProfile['user_id'];
  birth_year: BioProfile['birth_year'];
  sex: BioProfile['sex'];
  height_cm: BioProfile['height_cm'];
  weight_kg: BioProfile['weight_kg'];
  waist_cm: BioProfile['waist_cm'];
  body_fat_pct: BioProfile['body_fat_pct'];
  activity_level: BioProfile['activity_level'];
  sleep_hours_avg: BioProfile['sleep_hours_avg'];
  stress_level: BioProfile['stress_level'];
  allergies: BioProfile['allergies'];
  intolerances: BioProfile['intolerances'];
  medical_conditions: BioProfile['medical_conditions'];
  medications: BioProfile['medications'];
  biomarkers: BioProfile['biomarkers'];
  primary_goal: BioProfile['primary_goal'];
  secondary_goals: BioProfile['secondary_goals'];
  diet_type: BioProfile['diet_type'];
  cuisine_preferences: BioProfile['cuisine_preferences'];
  disliked_ingredients: BioProfile['disliked_ingredients'];
  bmr_kcal: BioProfile['bmr_kcal'];
  tdee_kcal: BioProfile['tdee_kcal'];
  target_kcal: BioProfile['target_kcal'];
  macro_targets: BioProfile['macro_targets'];
  version: BioProfile['version'];
  created_at: string;
  updated_at: string;
};
void _bioProfileWireRowParity;
