// Sprint A meal-plans wire schemas (IMPL-APP-001a-4).
//
// BFF proxies the meal-plan-engine responses as-is. Detail / list endpoints return
// raw meal-plan rows (no `{meal_plan: ...}` wrapper) per
// `services/meal-plan-engine/src/routes/meal_plans.py:258-269`. Generation returns
// a lightweight `{id, status, estimated_completion_sec, poll_url, ws_channel}` payload.

import { z } from 'zod';
import { MealPlanStatus } from '../enums.js';
import type { MealPlan } from '../entities.js';
import { IsoDateTime, UuidV7 } from './_utils.js';
import { DailyPlanSchema } from '../jsonb/index.js';

const MealPlanSubstitutionSchema = z.object({
  original_ingredient_id: UuidV7,
  substitute_ingredient_id: UuidV7,
  reason: z.string(),
});

export const MealPlanAdjustmentsSchema = z.object({
  calorie_adjustment_pct: z.number().optional(),
  protein_boost_g: z.number().min(0).optional(),
  removed_allergens: z.array(z.string()).optional(),
  substitutions: z.array(MealPlanSubstitutionSchema).optional(),
  added_supplements: z.array(z.string()).optional(),
});
// Type re-exported from `entities.ts` at the top-level barrel; don't export again here.

export const MealPlanWireSchema = z.object({
  id: UuidV7,
  user_id: UuidV7,
  base_diet_id: UuidV7,
  name: z.string().nullable(),
  status: MealPlanStatus,
  adjustments: MealPlanAdjustmentsSchema,
  // BE's MealPlanRow (Python) carries an optional `preferences` dict not present on the
  // TS entity — treat as wire-only passthrough.
  preferences: z.record(z.string(), z.unknown()).optional(),
  start_date: z.string(), // 'YYYY-MM-DD'
  end_date: z.string(),
  daily_plans: z.array(DailyPlanSchema),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable().optional(),
});
export type MealPlanWire = z.infer<typeof MealPlanWireSchema>;

export const MealPlanListResponseSchema = z.object({
  items: z.array(MealPlanWireSchema),
  next_cursor: z.string().nullable(),
  has_next: z.boolean(),
});
export type MealPlanListResponse = z.infer<typeof MealPlanListResponseSchema>;

// Detail endpoint returns the row directly, not a `{meal_plan: ...}` wrapper.
export const MealPlanDetailResponseSchema = MealPlanWireSchema;
export type MealPlanDetailResponse = z.infer<typeof MealPlanDetailResponseSchema>;

export const GenerateMealPlanRequestSchema = z.object({
  base_diet_id: UuidV7,
  duration_days: z.number().int().min(1).max(30).default(7),
  preferences: z.record(z.string(), z.unknown()).optional(),
});
export type GenerateMealPlanRequest = z.infer<typeof GenerateMealPlanRequestSchema>;

export const GenerateMealPlanResponseSchema = z.object({
  id: UuidV7,
  status: MealPlanStatus, // always 'queued' at accept-time
  estimated_completion_sec: z.number().int().min(0),
  poll_url: z.string(),
  ws_channel: z.string(),
});
export type GenerateMealPlanResponse = z.infer<typeof GenerateMealPlanResponseSchema>;

// Regenerate returns `{id, status: 'queued'}` — thin echo of the accept.
export const RegenerateMealPlanRequestSchema = z.object({}).passthrough();
export type RegenerateMealPlanRequest = z.infer<typeof RegenerateMealPlanRequestSchema>;

export const RegenerateMealPlanResponseSchema = z.object({
  id: UuidV7,
  status: MealPlanStatus,
});
export type RegenerateMealPlanResponse = z.infer<typeof RegenerateMealPlanResponseSchema>;

// WebSocket ticket exchange.
export const WsTicketRequestSchema = z.object({
  meal_plan_id: UuidV7,
});
export type WsTicketRequest = z.infer<typeof WsTicketRequestSchema>;

export const WsTicketResponseSchema = z.object({
  ticket: z.string().min(1),
  ws_url: z.string(),
  meal_plan_id: UuidV7,
  expires_at: IsoDateTime,
});
export type WsTicketResponse = z.infer<typeof WsTicketResponseSchema>;

// Wire↔Row parity guard (D1). `preferences` + `deleted_at` are wire-only / optional.
// `adjustments` + `daily_plans` are JSONB-shared via MealPlanAdjustmentsSchema /
// DailyPlanSchema (same z.infer instance) — structural parity is by construction,
// excluded here to avoid `.optional() → T | undefined` vs `key?: T` false positives.
const _mealPlanWireRowParity = null as unknown as Omit<
  MealPlanWire,
  'preferences' | 'deleted_at' | 'adjustments' | 'daily_plans'
> satisfies {
  id: MealPlan['id'];
  user_id: MealPlan['user_id'];
  base_diet_id: MealPlan['base_diet_id'];
  name: MealPlan['name'];
  status: MealPlan['status'];
  start_date: MealPlan['start_date'];
  end_date: MealPlan['end_date'];
  created_at: string;
  updated_at: string;
};
void _mealPlanWireRowParity;
