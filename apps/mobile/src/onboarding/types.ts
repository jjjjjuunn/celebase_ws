// Onboarding draft state — flat, in-memory only.
//
// Data-minimization (2026-05-24) + launch-v1 PHI removal
// (IMPL-PHI-LAUNCH-V1-REMOVAL-001, 2026-05-27): we collect ONLY non-PHI fields
// the meal-plan engine consumes (phi_minimizer.TASK_FIELD_MAP):
//   - calorie/macro: weight, height, activity, diet_type, primary_goal
//   - allergen_filter: allergies (hard exclusion)
//
// Deliberately NOT collected (Apple 5.1.3 / GDPR Art.9 — reintroduce post-BAA):
//   - medical_conditions — engine never reads it; unused PHI = pure liability.
//   - medications (incl. the GLP-1 flag) — removed at launch; the engine's GLP-1
//     protein floor degrades gracefully to the standard floor without it.
//   - waist_cm — engine never reads it.
//
// PHI safety: no health-sensitive field is collected at launch; state stays
// in-memory only and the single bio-profile POST sends only the above non-PHI.

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
