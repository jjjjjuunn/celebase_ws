// Onboarding draft state — flat, in-memory only.
//
// Data-minimization (researched decision, 2026-05-24): we collect ONLY fields
// the meal-plan engine actually consumes (phi_minimizer.TASK_FIELD_MAP):
//   - calorie/macro: weight, height, activity, diet_type, primary_goal
//   - allergen_filter: allergies (hard exclusion)
//   - GLP-1 protein floor: a single boolean (engine only calls _has_glp1())
//
// Deliberately NOT collected:
//   - medical_conditions — engine never reads it; collecting unused PHI is pure
//     liability, and using it safely would be condition-specific medical
//     nutrition therapy (FDA "treat/mitigate disease" → regulated). Dropped.
//   - full medication list — only the GLP-1 flag is used; the rest is unused PHI.
//   - waist_cm — engine never reads it.
//
// PHI safety: state stays in-memory only (no plaintext persistence); the GLP-1
// flag is the only health-sensitive field and is sent solely via the single
// bio-profile POST.

import type { ActivityLevel, DietType, PrimaryGoal, Sex } from '@celebbase/shared-types';

/**
 * In-flow wizard state. Picker-backed fields (birth_year, height, weight)
 * resolve to a default on their step's mount, so by the reveal step every
 * required field is populated.
 */
export interface OnboardingDraft {
  /** In-flow greeting + persisted once at onboarding completion via
   * PATCH /users/me (IMPL-MOBILE-SIGNUP-DISPLAYNAME-001 — signup no longer
   * collects a name; this step is the personalized-path collection point). */
  display_name: string;
  birth_year?: number;
  sex?: Sex;
  height_ft?: number;
  height_in?: number;
  weight_lb?: number;
  activity_level?: ActivityLevel;
  allergies: string[];
  /** Single GLP-1 / weight-management medication flag → medications: ['glp1']. */
  has_glp1?: boolean;
  primary_goal?: PrimaryGoal;
  secondary_goals: string[];
  diet_type: DietType | null;
}

export const EMPTY_DRAFT: OnboardingDraft = {
  display_name: '',
  allergies: [],
  secondary_goals: [],
  diet_type: null,
};
