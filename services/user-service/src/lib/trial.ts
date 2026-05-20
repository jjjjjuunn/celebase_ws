// Post-onboarding free-trial computation (FEAT-MOBILE-TRIAL-MEALPLAN-001).
//
// The trial is server-anchored on `bio_profiles.created_at` — the instant the
// user completes onboarding (single row per user; `ON CONFLICT (user_id)` keeps
// created_at fixed at first creation). During the trial window a free-tier user
// is granted Premium-equivalent meal-plan generation quota (the meal-plan-engine
// reads `trial_active` from `GET /subscriptions/me`).
//
// Mirrors the mobile client window (`apps/mobile/src/lib/use-access-policy.ts`,
// TRIAL_DURATION_MS) so server-side and client-side gating agree.

export const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export interface TrialState {
  trial_active: boolean;
  /** ISO 8601 UTC instant the trial ends/ended, or null when no trial applies. */
  trial_ends_at: string | null;
}

/**
 * Compute trial state from the subscription tier and the bio-profile creation
 * time.
 *
 * - A trial only applies to the `free` tier (paid tiers already have quota).
 * - No bio profile yet (onboarding incomplete) → no trial.
 * - `trial_active` is true only while `now` is before `created_at + TRIAL_DURATION_MS`.
 * - `trial_ends_at` is the computed end instant whenever a trial anchor exists
 *   (active or expired), so the client can show "trial ends/ended at"; it is
 *   null for paid tiers or when onboarding is incomplete.
 */
export function computeTrialState(
  tier: string,
  bioCreatedAt: Date | null,
  now: Date = new Date(),
): TrialState {
  if (tier !== 'free' || bioCreatedAt === null) {
    return { trial_active: false, trial_ends_at: null };
  }
  const endsAtMs = bioCreatedAt.getTime() + TRIAL_DURATION_MS;
  return {
    trial_active: now.getTime() < endsAtMs,
    trial_ends_at: new Date(endsAtMs).toISOString(),
  };
}
