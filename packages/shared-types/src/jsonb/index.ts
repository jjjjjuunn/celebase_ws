import { z } from 'zod';

// spec §3.1 base_diets.macro_ratio
export const MacroRatioSchema = z.object({
  protein_pct: z.number().min(0).max(100),
  carbs_pct: z.number().min(0).max(100),
  fat_pct: z.number().min(0).max(100),
});
export type MacroRatio = z.infer<typeof MacroRatioSchema>;

// spec §3.1 bio_profiles.macro_targets
export const MacroTargetsSchema = z.object({
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
  fiber_g: z.number().min(0).optional(),
});
export type MacroTargets = z.infer<typeof MacroTargetsSchema>;

// spec §3.1 recipes.nutrition
export const NutritionSchema = z.object({
  calories: z.number().min(0),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
  fiber_g: z.number().min(0).optional(),
  sugar_g: z.number().min(0).optional(),
  sodium_mg: z.number().min(0).optional(),
  micronutrients: z.record(z.string(), z.number()).optional(),
});
export type Nutrition = z.infer<typeof NutritionSchema>;

// spec §3.1 bio_profiles.biomarkers
export const BiomarkersSchema = z.object({
  fasting_glucose_mg_dl: z.number().optional(),
  hba1c_pct: z.number().optional(),
  total_cholesterol_mg_dl: z.number().optional(),
  ldl_mg_dl: z.number().optional(),
  hdl_mg_dl: z.number().optional(),
  triglycerides_mg_dl: z.number().optional(),
  crp_mg_l: z.number().optional(),
  vitamin_d_ng_ml: z.number().optional(),
  ferritin_ng_ml: z.number().optional(),
  testosterone_ng_dl: z.number().nullable().optional(),
  last_lab_date: z.string().optional(),
});
export type Biomarkers = z.infer<typeof BiomarkersSchema>;

// spec §3.1 recipes.instructions
export const InstructionStepSchema = z.object({
  step: z.number().int().min(1),
  text: z.string().min(1),
  duration_min: z.number().int().min(1).nullable().optional(),
});
export type InstructionStep = z.infer<typeof InstructionStepSchema>;

// spec §3.1 meal_plans.daily_plans
// Plan 22 · Phase B — `narrative` (persona voice for this slot, ≤300 chars) and
// `citations` (spec §5.8 LLM Enhancement Layer) are populated by the meal-plan-engine
// LLM reranker; rule-based engine leaves both omitted. Drawer falls back gracefully.
import { CitationSchema as _DailyMealCitationSchema } from './citation.js';
export const DailyMealSchema = z.object({
  meal_type: z.string(),
  recipe_id: z.string().uuid(),
  adjusted_nutrition: NutritionSchema.optional(),
  adjusted_servings: z.number().min(0).optional(),
  narrative: z.string().max(300).nullable().optional(),
  citations: z.array(_DailyMealCitationSchema).optional(),
});
export type DailyMeal = z.infer<typeof DailyMealSchema>;

export const DailyTotalsSchema = z.object({
  calories: z.number().min(0),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
});
export type DailyTotals = z.infer<typeof DailyTotalsSchema>;

export const DailyPlanSchema = z.object({
  day: z.number().int().min(1),
  date: z.string(),
  meals: z.array(DailyMealSchema),
  daily_totals: DailyTotalsSchema,
});
export type DailyPlan = z.infer<typeof DailyPlanSchema>;

// spec §3.1 base_diets.source_refs
export const SourceRefSchema = z.object({
  type: z.string(),
  outlet: z.string(),
  date: z.string(),
  url: z.string().url().optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

// spec §3.1 subscriptions.quota_override
export const QuotaOverrideSchema = z.object({
  max_plans_per_month: z.number().int().min(0).optional(),
  max_diet_views_per_month: z.number().int().min(0).nullable().optional(),
});
export type QuotaOverride = z.infer<typeof QuotaOverrideSchema>;

// spec §5.8 LLM Enhancement Layer — Citation
export * from './citation.js';

// Plan 22-vast-adleman · Phase C1 — users.preferences JSONB
export * from './user-preferences.js';
