// Sprint A recipes wire schemas (IMPL-APP-001a-4).

import { z } from 'zod';
import { MealType, RecipeDifficulty } from '../enums.js';
import type { Recipe } from '../entities.js';
import { IsoDateTime, UuidV7 } from './_utils.js';
import { CitationSchema, InstructionStepSchema, NutritionSchema } from '../jsonb/index.js';

// Plan 22 · Phase B — Meal Rationale Drawer data contract.
// `citations` mirrors recipes.citations JSONB (migration 0011). Default [] preserves
// backwards compatibility for rule-based engine output (no citations). `narrative`
// is LLM-generated persona voice; lives on meal_plans.days[].meals[].narrative JSONB
// but is also surfaced on recipe detail when the server hydrates the slot context.
export const RecipeWireSchema = z.object({
  id: UuidV7,
  base_diet_id: UuidV7,
  title: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  meal_type: MealType,
  prep_time_min: z.number().int().min(0).nullable(),
  cook_time_min: z.number().int().min(0).nullable(),
  servings: z.number().int().min(1),
  difficulty: RecipeDifficulty.nullable(),
  nutrition: NutritionSchema,
  instructions: z.array(InstructionStepSchema),
  tips: z.string().nullable(),
  image_url: z.string().url().nullable(),
  video_url: z.string().url().nullable(),
  citations: z.array(CitationSchema),
  // FIX-MEAL-RECIPE-ALLERGEN-EXPOSURE-001 — derived flat allergen set the meal-plan
  // engine filters against. `.default([])` keeps consumers tolerant of a stale BE
  // response (omitting the field) during a rolling deploy.
  allergens: z.array(z.string()).default([]),
  narrative: z.string().nullable().optional(),
  is_active: z.boolean(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});
export type RecipeWire = z.infer<typeof RecipeWireSchema>;

export const RecipeListResponseSchema = z.object({
  items: z.array(RecipeWireSchema),
  next_cursor: z.string().nullable(),
  has_next: z.boolean(),
});
export type RecipeListResponse = z.infer<typeof RecipeListResponseSchema>;

// Lean ingredient shape for the recipe detail screen (mobile). Derived from the
// recipe_ingredients join — name from the linked ingredient, plus per-recipe
// quantity/unit/preparation/optional flag.
export const RecipeIngredientWireSchema = z.object({
  name: z.string().min(1),
  quantity: z.number(),
  unit: z.string(),
  preparation: z.string().nullable(),
  is_optional: z.boolean(),
});
export type RecipeIngredientWire = z.infer<typeof RecipeIngredientWireSchema>;

export const RecipeDetailResponseSchema = z.object({
  recipe: RecipeWireSchema,
  // BFF maps the recipe_ingredients join → lean list. `.default([])` keeps the
  // pre-deploy / batch-fallback shape (recipe-only) valid.
  ingredients: z.array(RecipeIngredientWireSchema).default([]),
});
export type RecipeDetailResponse = z.infer<typeof RecipeDetailResponseSchema>;

// content-service `GET /recipes/:id` returns the recipe with a nested
// recipe_ingredients join (RecipeWithIngredients). The BFF parses with this to
// retain the join (RecipeWireSchema alone strips it), then maps to the lean
// `ingredients` array above.
export const RecipeDetailContentSchema = RecipeWireSchema.extend({
  recipe_ingredients: z
    .array(
      z.object({
        quantity: z.number(),
        unit: z.string(),
        preparation: z.string().nullable().optional(),
        is_optional: z.boolean(),
        sort_order: z.number().int(),
        ingredient: z.object({ name: z.string().min(1) }).passthrough(),
      }),
    )
    .default([]),
});
export type RecipeDetailContent = z.infer<typeof RecipeDetailContentSchema>;

// Plan 22 · Phase D3 — batch lookup response for `GET /recipes?ids=...`.
// Unordered; not paginated. Callers reassemble by id.
export const RecipeBatchResponseSchema = z.object({
  recipes: z.array(RecipeWireSchema),
});
export type RecipeBatchResponse = z.infer<typeof RecipeBatchResponseSchema>;

// GET /recipes/:id/personalized — same recipe with user-specific serving/nutrition adjustments.
// `scaling_factor` is the multiplier applied to ingredients/nutrition to meet the user's calorie
// target. `adjusted_nutrition` reflects the scaled values for the user's serving size.
export const PersonalizedRecipeResponseSchema = z.object({
  recipe: RecipeWireSchema,
  personalization: z.object({
    scaling_factor: z.number().positive(),
    adjusted_nutrition: NutritionSchema,
    adjusted_servings: z.number().int().min(1),
  }),
});
export type PersonalizedRecipeResponse = z.infer<typeof PersonalizedRecipeResponseSchema>;

// Wire↔Row parity guard. `instructions` + `nutrition` + `citations` are JSONB-shared
// via InstructionStepSchema / NutritionSchema / CitationSchema (same z.infer instance),
// so structural parity is by construction — excluded from the top-level name/optionality
// check to avoid false positives from Zod's `.optional() → T | undefined` inference
// vs `entities.Recipe`'s `key: T | null` declaration. `narrative` is wire-only (lives
// on meal_plans.days[].meals[].narrative JSONB, surfaced on recipe detail by the BFF).
const _recipeWireRowParity = null as unknown as Omit<
  RecipeWire,
  'instructions' | 'nutrition' | 'citations' | 'narrative'
> satisfies {
  id: Recipe['id'];
  base_diet_id: Recipe['base_diet_id'];
  title: Recipe['title'];
  slug: Recipe['slug'];
  description: Recipe['description'];
  meal_type: Recipe['meal_type'];
  prep_time_min: Recipe['prep_time_min'];
  cook_time_min: Recipe['cook_time_min'];
  servings: Recipe['servings'];
  difficulty: Recipe['difficulty'];
  tips: Recipe['tips'];
  image_url: Recipe['image_url'];
  video_url: Recipe['video_url'];
  is_active: Recipe['is_active'];
  created_at: string;
  updated_at: string;
};
void _recipeWireRowParity;
