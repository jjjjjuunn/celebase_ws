import { z } from 'zod';

// Step 0 — Persona Select (persona-first, spec §7.1 v2026-04-22)
export const WizardStep0Schema = z.object({
  preferred_celebrity_slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
});
export type WizardStep0 = z.infer<typeof WizardStep0Schema>;

// Step 1 — Basic Info
// birth_month / birth_day are UI-only (not transmitted to BE yet — server accepts birth_year only)
export const WizardStep1Schema = z.object({
  display_name: z.string().min(1).max(100),
  birth_year: z.number().int().min(1920).max(2013),
  birth_month: z.number().int().min(1).max(12).optional(),
  birth_day: z.number().int().min(1).max(31).optional(),
  sex: z.enum(['male', 'female']),
});
export type WizardStep1 = z.infer<typeof WizardStep1Schema>;

// Step 2 — Body Metrics
export const WizardStep2Schema = z.object({
  height_cm: z.number().min(100).max(250),
  weight_kg: z.number().min(30).max(300),
  waist_cm: z.number().min(40).max(200).optional(),
  activity_level: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
});
export type WizardStep2 = z.infer<typeof WizardStep2Schema>;

// Step 3 — Health Info (PHI — never logged)
export const WizardStep3Schema = z.object({
  allergies: z.array(z.string()).default([]),
  intolerances: z.array(z.string()).default([]),
  medical_conditions: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
});
export type WizardStep3 = z.infer<typeof WizardStep3Schema>;

// Step 4 — Goals & Preferences
export const WizardStep4Schema = z.object({
  primary_goal: z.enum(['weight_loss', 'muscle_gain', 'maintenance', 'longevity', 'energy']),
  secondary_goals: z.array(z.string()).default([]),
  diet_type: z.enum(['omnivore', 'pescatarian', 'vegetarian', 'vegan', 'keto', 'paleo', 'mediterranean']),
  cuisine_preferences: z.array(z.string()).default([]),
  disliked_ingredients: z.array(z.string()).default([]),
});
export type WizardStep4 = z.infer<typeof WizardStep4Schema>;

// Full wizard form state (all steps, all partial during wizard).
// step0 (persona select) is persona-first addition — drives S7 Blueprint Reveal.
export const WizardFormSchema = z.object({
  step0: WizardStep0Schema.partial(),
  step1: WizardStep1Schema.partial(),
  step2: WizardStep2Schema.partial(),
  step3: WizardStep3Schema,
  step4: WizardStep4Schema.partial(),
});
export type WizardForm = z.infer<typeof WizardFormSchema>;

// Persona-first onboarding order (spec §7.1):
//   S2 Persona Select → S3 Basic Info → S4 Body Metrics
//   → S5 Activity & Health → S6 Goals & Diet → S7 Blueprint Reveal
// Step indices below are wizard-internal (0..5); spec S-numbers are for humans.
export const WIZARD_STEPS = [
  { label: 'Persona' },
  { label: 'Basic Info' },
  { label: 'Body Metrics' },
  { label: 'Activity & Health' },
  { label: 'Goals & Diet' },
  { label: 'Blueprint' },
] as const;

export const WIZARD_STEP_COUNT = WIZARD_STEPS.length;

// sessionStorage draft key for S7 5xx recovery (spec §7.1 S7 CTA, Gemini HIGH-G2).
export const WIZARD_DRAFT_KEY = 'cb.onboarding.draft.v1';

export function emptyWizardForm(): WizardForm {
  return {
    step0: {},
    step1: {},
    step2: {},
    step3: { allergies: [], intolerances: [], medical_conditions: [], medications: [] },
    step4: {},
  };
}
