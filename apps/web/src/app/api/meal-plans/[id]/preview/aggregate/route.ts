import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../../../_lib/bff-fetch.js';
import { createProtectedRoute, type Session } from '../../../../_lib/session.js';
import { toBffErrorResponse } from '../../../../_lib/bff-error.js';
import {
  aggregationKey,
  canonicalize,
  normalizeName,
  type CanonicalUnit,
} from '../../../../../../features/plans/lib/unit-map.js';

// Plan 22 · Phase D2 — preview aggregate.
// POST body `{ skipped_slots }` → resolves meal plan + recipes, filters out the
// skipped `"{date}:{meal_type}"` slots, then aggregates `recipe_ingredients` by
// `normalize(name) + ':' + canonical(unit)`. Mismatched dimensions under the
// same name are reported via `unit_conflicts` rather than summed.

// Aggregation-specific view of a recipe — content-service returns these columns
// from the JOIN, but the public RecipeWireSchema omits `recipe_ingredients`.
// We keep the extended shape BFF-local to avoid rippling into shared-types.
const RecipeIngredientViewSchema = z.object({
  quantity: z.number(),
  unit: z.string(),
  is_optional: z.boolean(),
  ingredient: z.object({
    name: z.string(),
    name_normalized: z.string().nullable().optional(),
    default_unit: z.string().nullable().optional(),
  }),
});

const RecipeWithIngredientsViewSchema = z.object({
  id: z.string().uuid(),
  servings: z.number().int().min(1),
  recipe_ingredients: z.array(RecipeIngredientViewSchema),
});
type RecipeWithIngredientsView = z.infer<typeof RecipeWithIngredientsViewSchema>;

const ContentRecipesBatchSchema = z.object({
  recipes: z.array(RecipeWithIngredientsViewSchema),
});

interface LineAccumulator {
  key: string;
  name: string;
  canonicalUnit: CanonicalUnit;
  qty: number;
  recipeRefs: Set<string>;
}

// Mock unit pricing (USD) — live IDP pricing lands in Plan 23.
const PRICE_PER_UNIT_USD: Record<CanonicalUnit, number> = {
  g: 0.004,
  ml: 0.003,
  count: 0.8,
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return createProtectedRoute(async (innerReq: NextRequest, session: Session) => {
    const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();
    const forwardedFor = innerReq.headers.get('x-forwarded-for') ?? undefined;

    const body: unknown = await innerReq.json().catch(() => ({}));
    const parsedBody = schemas.PlanPreviewAggregateRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', requestId },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        },
      );
    }
    const skipped = new Set(parsedBody.data.skipped_slots);

    const planResult = await fetchBff('meal-plan', `/meal-plans/${encodeURIComponent(id)}`, {
      method: 'GET',
      schema: schemas.MealPlanDetailResponseSchema,
      requestId,
      forwardedFor,
      userId: session.user_id,
      authToken: session.raw_token,
    });
    if (!planResult.ok) {
      return toBffErrorResponse(planResult.error, requestId);
    }
    const plan = planResult.data;

    const recipeIds = new Set<string>();
    for (const day of plan.daily_plans) {
      for (const meal of day.meals) {
        const slot = `${day.date}:${meal.meal_type}`;
        if (skipped.has(slot)) continue;
        recipeIds.add(meal.recipe_id);
      }
    }

    if (recipeIds.size === 0) {
      return new Response(
        JSON.stringify({
          ingredients: [],
          skipped_slots: parsedBody.data.skipped_slots,
          estimated_total_usd: 0,
          unit_conflicts: [],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        },
      );
    }

    const idsCsv = Array.from(recipeIds).join(',');
    const recipesResult = await fetchBff(
      'content',
      `/recipes?ids=${encodeURIComponent(idsCsv)}`,
      {
        method: 'GET',
        schema: ContentRecipesBatchSchema,
        requestId,
        forwardedFor,
        userId: session.user_id,
        authToken: session.raw_token,
      },
    );
    if (!recipesResult.ok) {
      return toBffErrorResponse(recipesResult.error, requestId);
    }
    const recipesById = new Map<string, RecipeWithIngredientsView>();
    for (const r of recipesResult.data.recipes) {
      recipesById.set(r.id, r);
    }

    const acc = new Map<string, LineAccumulator>();
    const unitConflicts = new Set<string>();

    for (const day of plan.daily_plans) {
      for (const meal of day.meals) {
        const slot = `${day.date}:${meal.meal_type}`;
        if (skipped.has(slot)) continue;
        const recipe = recipesById.get(meal.recipe_id);
        if (!recipe) continue;
        const baseServings = recipe.servings;
        const actualServings = meal.adjusted_servings ?? baseServings;
        const scale = baseServings > 0 ? actualServings / baseServings : 1;
        for (const ri of recipe.recipe_ingredients) {
          if (ri.is_optional) continue;
          const c = canonicalize(ri.unit, ri.quantity * scale);
          const name = ri.ingredient.name;
          const normalized = ri.ingredient.name_normalized ?? normalizeName(name);
          if (c === null) {
            unitConflicts.add(name);
            continue;
          }
          const key = aggregationKey(normalized, c.canonical_unit);
          const existing = acc.get(key);
          if (existing) {
            existing.qty += c.qty;
            existing.recipeRefs.add(recipe.id);
          } else {
            acc.set(key, {
              key,
              name,
              canonicalUnit: c.canonical_unit,
              qty: c.qty,
              recipeRefs: new Set<string>([recipe.id]),
            });
          }
        }
      }
    }

    // Detect cross-dimension conflicts: same normalized name with multiple units.
    const nameToUnits = new Map<string, Set<CanonicalUnit>>();
    for (const line of acc.values()) {
      const normalized = normalizeName(line.name);
      const bucket = nameToUnits.get(normalized) ?? new Set<CanonicalUnit>();
      bucket.add(line.canonicalUnit);
      nameToUnits.set(normalized, bucket);
    }
    for (const line of acc.values()) {
      const normalized = normalizeName(line.name);
      const units = nameToUnits.get(normalized);
      if (units && units.size > 1) unitConflicts.add(line.name);
    }

    let estimatedTotalUsd = 0;
    const ingredients = Array.from(acc.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((line) => {
        const rounded = Math.round(line.qty * 100) / 100;
        estimatedTotalUsd += rounded * (PRICE_PER_UNIT_USD[line.canonicalUnit] ?? 0);
        return {
          key: line.key,
          name: line.name,
          qty: rounded,
          unit: line.canonicalUnit,
          recipe_refs: Array.from(line.recipeRefs),
        };
      });

    const payload = {
      ingredients,
      skipped_slots: parsedBody.data.skipped_slots,
      estimated_total_usd: Math.round(estimatedTotalUsd * 100) / 100,
      unit_conflicts: Array.from(unitConflicts),
    };
    const parsedResponse = schemas.PlanPreviewAggregateResponseSchema.parse(payload);
    return new Response(JSON.stringify(parsedResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    });
  })(req);
}
