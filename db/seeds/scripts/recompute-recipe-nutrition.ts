/**
 * Recipe nutrition recompute from ingredient nutrition_per_100g.
 *
 * Workflow:
 *   `tsx db/seeds/scripts/recompute-recipe-nutrition.ts`
 *     → SELECT recipes (nutrition_source = 'manual_legacy' 만 — idempotent)
 *     → 각 recipe 의 recipe_ingredients JOIN → per-ingredient gram 계산
 *     → Σ(ingredient.nutrition_per_100g[k] × portion_g / 100) / servings
 *     → atomic UPDATE recipes.nutrition + nutrition_source
 *
 * Provenance rule:
 *   모든 ingredient 가 nutrition_source IN ('usda_fdc','nih_ods') 이고 unit→gram
 *   변환 miss < 3 이면 → nutrition_source = 'derived_from_ingredients'
 *   하나라도 'manual_verified'/'manual_legacy' 또는 unit miss ≥ 3 →
 *   기존 nutrition_source ('manual_legacy') 유지 + 본 row skip
 *
 * fail-closed:
 *   - DATABASE_URL 미설정 시 exit 1
 *   - 종료 시 nutrition_source = 'manual_legacy' 인 recipes 수 보고 (warn only,
 *     실패 아님 — 일부 mixed-source recipes 는 derived 불가가 정상)
 *
 * idempotent: 재실행 시 nutrition_source = 'manual_legacy' 만 처리.
 *
 * Env: DATABASE_URL
 */
import pg from 'pg';

type RecipeRow = {
  id: string;
  servings: unknown;
};

type IngredientRow = {
  quantity: unknown;
  unit: unknown;
  nutrition_per_100g: unknown;
  portion_conversions: unknown;
  nutrition_source: string | null;
};

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL env var');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await runRecompute(pool);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Recompute failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

export async function runRecompute(pool: pg.Pool): Promise<void> {
  const { rows: recipes } = await pool.query<RecipeRow>(
    `SELECT id, servings FROM recipes
       WHERE nutrition_source = 'manual_legacy' AND is_active = TRUE
       ORDER BY id`,
  );
  console.error(`Found ${String(recipes.length)} recipes to recompute`);

  let derived = 0;
  let skipped = 0;

  for (const recipe of recipes) {
    const servings = normalizeNumber(recipe.servings);
    if (servings === null || servings <= 0) {
      console.error(`Skip recipe ${recipe.id}: invalid servings value`);
      skipped += 1;
      continue;
    }

    const { rows: ingredientRows } = await pool.query<IngredientRow>(
      `SELECT ri.quantity, ri.unit, i.nutrition_per_100g, i.portion_conversions, i.nutrition_source
         FROM recipe_ingredients ri
         JOIN ingredients i ON i.id = ri.ingredient_id
         WHERE ri.recipe_id = $1 AND i.is_active = TRUE`,
      [recipe.id],
    );

    if (ingredientRows.length === 0) {
      console.error(`Skip recipe ${recipe.id}: no active ingredients`);
      skipped += 1;
      continue;
    }

    const allUsdaOrNih = ingredientRows.every(
      (ing) => ing.nutrition_source === 'usda_fdc' || ing.nutrition_source === 'nih_ods',
    );

    if (!allUsdaOrNih) {
      console.error(`Skip recipe ${recipe.id}: mixed nutrition source`);
      skipped += 1;
      continue;
    }

    const processed = ingredientRows.map((ing) => ({
      quantity: normalizeNumber(ing.quantity) ?? Number.NaN,
      unit: typeof ing.unit === 'string' ? ing.unit : '',
      nutrition_per_100g: ing.nutrition_per_100g,
      portion_conversions: ing.portion_conversions,
    }));

    const totals = aggregateRecipeNutrition(processed);
    const unitMissCount = (totals as Record<string, number> & { __unitMissCount?: number }).__unitMissCount ?? 0;
    if (unitMissCount >= 3) {
      console.error(`Skip recipe ${recipe.id}: unit conversions missing (${unitMissCount})`);
      skipped += 1;
      continue;
    }

    const perServing = divideByServings(totals, servings);

    await pool.query(
      `UPDATE recipes
         SET nutrition = $1::jsonb, nutrition_source = 'derived_from_ingredients'
       WHERE id = $2`,
      [JSON.stringify(perServing), recipe.id],
    );
    derived += 1;
  }

  console.error(`Derived: ${String(derived)} / Skipped: ${String(skipped)} / Total: ${String(recipes.length)}`);

  const { rows: legacyRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM recipes WHERE nutrition_source = 'manual_legacy' AND is_active = TRUE`,
  );
  const legacyCount = Number(legacyRows[0]?.count ?? '0');
  if (legacyCount > 0) {
    console.warn(
      `WARN: ${String(legacyCount)} recipes remain with nutrition_source='manual_legacy' — likely mixed-source ingredients (acceptable, see SPEC §5.5)`,
    );
  }
}

export function aggregateRecipeNutrition(
  ings: Array<{
    quantity: number;
    unit: string;
    nutrition_per_100g: unknown;
    portion_conversions: unknown;
  }>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  let unitMissCount = 0;

  for (const ing of ings) {
    const grams = unitToGrams(ing.unit, ing.quantity, ing.portion_conversions);
    if (grams === null) {
      unitMissCount += 1;
      continue;
    }
    const nutr = ing.nutrition_per_100g;
    if (!isRecord(nutr)) continue;

    for (const [k, v] of Object.entries(nutr)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        totals[k] = (totals[k] ?? 0) + v * (grams / 100);
      }
    }
  }

  if (unitMissCount >= 3) {
    console.warn(`WARN: ${String(unitMissCount)} unit conversions missed in recipe — totals may be incomplete`);
  }

  Object.defineProperty(totals, '__unitMissCount', {
    value: unitMissCount,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return totals;
}

export function divideByServings(totals: Record<string, number>, servings: number): Record<string, number> {
  if (servings <= 0) return totals;
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(totals)) {
    result[k] = v / servings;
  }
  return result;
}

const FALLBACK_GRAM: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  mg: 0.001,
  oz: 28.3495,
  ounce: 28.3495,
  lb: 453.592,
  pound: 453.592,
  tsp: 5,
  teaspoon: 5,
  tbsp: 15,
  tablespoon: 15,
  cup: 240,
  large: 50,
  medium: 50,
  small: 30,
  whole: 100,
  piece: 50,
  slice: 30,
  bunch: 100,
  clove: 4,
};

export function unitToGrams(
  unit: string,
  quantity: number,
  portionConversions: unknown,
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const unitLc = unit.trim().toLowerCase();

  if (isRecord(portionConversions)) {
    const specific = portionConversions[unitLc];
    if (typeof specific === 'number' && Number.isFinite(specific)) {
      return specific * quantity;
    }
  }

  const fallback = FALLBACK_GRAM[unitLc];
  if (typeof fallback === 'number' && Number.isFinite(fallback)) {
    return fallback * quantity;
  }

  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
