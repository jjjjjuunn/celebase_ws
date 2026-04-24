// Sprint B daily-logs wire schemas (IMPL-APP-002-0c).
//
// BFF proxies user-service `/daily-logs` responses. Create/update endpoint
// returns the row directly; list returns `{data, has_next}`; summary returns
// flat aggregates. PHI risk is low here (no biomarkers/medications) but
// `weight_kg` + `notes` still route through authenticated paths only.

import { z } from 'zod';
import type { DailyLog } from '../entities.js';
import { IsoDateTime, UuidV7 } from './_utils.js';

// `log_date` is a Postgres DATE, wire as 'YYYY-MM-DD'. `cursor` in list
// queries also uses this format (next page token = last row's log_date).
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

// JSONB `meals_completed` — optional per-slot booleans. Matches the row type
// structurally (`entities.DailyLog.meals_completed`). Unknown keys pass through.
export const MealsCompletedSchema = z.object({
  breakfast: z.boolean().optional(),
  lunch: z.boolean().optional(),
  dinner: z.boolean().optional(),
  snack: z.boolean().optional(),
});
export type MealsCompleted = z.infer<typeof MealsCompletedSchema>;

const Rating1To5 = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

export const DailyLogWireSchema = z.object({
  id: UuidV7,
  user_id: UuidV7,
  log_date: IsoDate,
  meals_completed: MealsCompletedSchema,
  weight_kg: z.number().min(0).nullable(),
  energy_level: Rating1To5.nullable(),
  mood: Rating1To5.nullable(),
  sleep_quality: Rating1To5.nullable(),
  notes: z.string().nullable(),
  created_at: IsoDateTime,
});
export type DailyLogWire = z.infer<typeof DailyLogWireSchema>;

// Create/Upsert — BE keys an (user_id, log_date) unique row. `log_date` is
// required; every other field is optional (merge semantics).
export const CreateDailyLogRequestSchema = z.object({
  log_date: IsoDate,
  meals_completed: MealsCompletedSchema.optional(),
  weight_kg: z.number().min(20).max(500).nullable().optional(),
  energy_level: Rating1To5.nullable().optional(),
  mood: Rating1To5.nullable().optional(),
  sleep_quality: Rating1To5.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type CreateDailyLogRequest = z.infer<typeof CreateDailyLogRequestSchema>;

// Single-row response — BE returns the row directly (no wrapper). Matches
// `daily-log.routes.ts:46` return shape.
export const DailyLogResponseSchema = DailyLogWireSchema;
export type DailyLogResponse = z.infer<typeof DailyLogResponseSchema>;

// List response — BE shape is `{data: DailyLog[], has_next: boolean}`. No
// `next_cursor` field; FE computes it from `data[last].log_date`.
export const DailyLogListResponseSchema = z.object({
  data: z.array(DailyLogWireSchema),
  has_next: z.boolean(),
});
export type DailyLogListResponse = z.infer<typeof DailyLogListResponseSchema>;

// List query — cursor is a date (YYYY-MM-DD), default limit 20, max 100.
export const DailyLogListQuerySchema = z.object({
  start_date: IsoDate,
  end_date: IsoDate,
  cursor: IsoDate.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type DailyLogListQuery = z.infer<typeof DailyLogListQuerySchema>;

// Summary — flat aggregates for a date range.
export const DailyLogSummaryResponseSchema = z.object({
  total_logs: z.number().int().min(0),
  avg_energy_level: z.number().nullable(),
  avg_mood: z.number().nullable(),
  avg_sleep_quality: z.number().nullable(),
  avg_weight_kg: z.number().nullable(),
  completion_rate: z.number().min(0).max(1),
});
export type DailyLogSummaryResponse = z.infer<typeof DailyLogSummaryResponseSchema>;

export const DailyLogSummaryQuerySchema = z.object({
  start_date: IsoDate,
  end_date: IsoDate,
});
export type DailyLogSummaryQuery = z.infer<typeof DailyLogSummaryQuerySchema>;

// Wire↔Row parity guard (D1): non-timestamp fields must match entities.DailyLog.
// `meals_completed` stays JSONB-shared via MealsCompletedSchema.
const _dailyLogWireRowParity = null as unknown as Omit<
  DailyLogWire,
  'meals_completed'
> satisfies {
  id: DailyLog['id'];
  user_id: DailyLog['user_id'];
  log_date: DailyLog['log_date'];
  weight_kg: DailyLog['weight_kg'];
  energy_level: DailyLog['energy_level'];
  mood: DailyLog['mood'];
  sleep_quality: DailyLog['sleep_quality'];
  notes: DailyLog['notes'];
  created_at: string;
};
void _dailyLogWireRowParity;
