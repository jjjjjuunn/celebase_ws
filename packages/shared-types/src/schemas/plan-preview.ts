// Plan 22 · Phase D2 — preview aggregation schemas.
//
// `recipes.ingredients` JSONB carries `{name, amount, unit}` only (no ingredient_id —
// Plan 23). Aggregation keys off `normalize(name) + ':' + canonical(unit)` instead.
// Mismatched units under the same name are reported via `unit_conflicts` rather than
// summed, so the user never sees silently wrong quantities.

import { z } from 'zod';
import { UuidV7 } from './_utils.js';

export const IngredientLineSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  qty: z.number().nonnegative(),
  unit: z.string(),
  recipe_refs: z.array(UuidV7),
});
export type IngredientLine = z.infer<typeof IngredientLineSchema>;

export const PlanPreviewAggregateRequestSchema = z.object({
  skipped_slots: z.array(z.string()).default([]),
});
export type PlanPreviewAggregateRequest = z.infer<typeof PlanPreviewAggregateRequestSchema>;

export const PlanPreviewAggregateResponseSchema = z.object({
  ingredients: z.array(IngredientLineSchema),
  skipped_slots: z.array(z.string()),
  estimated_total_usd: z.number().nullable(),
  unit_conflicts: z.array(z.string()),
});
export type PlanPreviewAggregateResponse = z.infer<typeof PlanPreviewAggregateResponseSchema>;
