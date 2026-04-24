// Plan 22 · Phase H — Day 5 WOW Moment trial recap response.
// GET /api/trial/recap returns the current trial day, rolling alignment,
// a short preview of upcoming meals, and the subscription upgrade target.

import { z } from 'zod';
import { DailyMealSchema } from '../jsonb/index.js';

export const TrialRecapPreviewMealSchema = z.object({
  date: z.string(),
  meal: DailyMealSchema,
});
export type TrialRecapPreviewMeal = z.infer<typeof TrialRecapPreviewMealSchema>;

export const TrialRecapResponseSchema = z.object({
  trial_day: z.number().int().min(1),
  alignment_pct: z.number().int().min(0).max(100).nullable(),
  celebrity_slug: z.string().min(1).max(100).nullable(),
  next_week_preview: z.array(TrialRecapPreviewMealSchema).max(3),
  cta_target: z.string().startsWith('/'),
});
export type TrialRecapResponse = z.infer<typeof TrialRecapResponseSchema>;
