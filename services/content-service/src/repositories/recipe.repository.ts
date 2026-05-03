import type pg from 'pg';
import type { Recipe, RecipeIngredient, Ingredient, Citation } from '@celebbase/shared-types';
import type { ListResult } from './celebrity.repository.js';

export interface RecipeWithIngredients extends Recipe {
  recipe_ingredients: Array<RecipeIngredient & { ingredient: Ingredient }>;
}

export interface ListRecipesOptions {
  meal_type?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Row shape returned by the JOIN query
interface RecipeJoinRow {
  // recipe columns
  id: string;
  base_diet_id: string;
  title: string;
  slug: string;
  description: string | null;
  meal_type: string;
  prep_time_min: number | null;
  cook_time_min: number | null;
  servings: number;
  difficulty: string | null;
  nutrition: unknown;
  instructions: unknown;
  tips: string | null;
  image_url: string | null;
  video_url: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  citations: unknown;
  // recipe_ingredient columns (prefixed)
  ri_id: string | null;
  ri_ingredient_id: string | null;
  ri_quantity: number | null;
  ri_unit: string | null;
  ri_preparation: string | null;
  ri_is_optional: boolean | null;
  ri_sort_order: number | null;
  // ingredient columns (prefixed)
  i_id: string | null;
  i_name: string | null;
  i_name_normalized: string | null;
  i_category: string | null;
  i_instacart_product_id: string | null;
  i_instacart_upc: string | null;
  i_default_unit: string | null;
  i_allergens: string[] | null;
  i_nutrition_per_100g: unknown;
  i_is_active: boolean | null;
  i_created_at: Date | null;
}

function assembleRecipe(rows: RecipeJoinRow[]): RecipeWithIngredients | null {
  const first = rows[0];
  if (first === undefined) return null;

  const recipe: RecipeWithIngredients = {
    id: first.id,
    base_diet_id: first.base_diet_id,
    title: first.title,
    slug: first.slug,
    description: first.description,
    meal_type: first.meal_type as Recipe['meal_type'],
    prep_time_min: first.prep_time_min,
    cook_time_min: first.cook_time_min,
    servings: first.servings,
    difficulty: first.difficulty as Recipe['difficulty'],
    nutrition: first.nutrition as Recipe['nutrition'],
    instructions: first.instructions as Recipe['instructions'],
    tips: first.tips,
    image_url: first.image_url,
    video_url: first.video_url,
    is_active: first.is_active,
    created_at: first.created_at,
    updated_at: first.updated_at,
    citations: (first.citations as Citation[] | null) ?? [],
    recipe_ingredients: [],
  };

  for (const row of rows) {
    if (
      row.ri_id === null ||
      row.i_id === null ||
      row.ri_ingredient_id === null ||
      row.ri_quantity === null ||
      row.ri_unit === null ||
      row.ri_is_optional === null ||
      row.ri_sort_order === null ||
      row.i_name === null ||
      row.i_name_normalized === null ||
      row.i_is_active === null ||
      row.i_created_at === null
    ) {
      continue;
    }

    const ri: RecipeIngredient & { ingredient: Ingredient } = {
      id: row.ri_id,
      recipe_id: recipe.id,
      ingredient_id: row.ri_ingredient_id,
      quantity: row.ri_quantity,
      unit: row.ri_unit,
      preparation: row.ri_preparation,
      is_optional: row.ri_is_optional,
      sort_order: row.ri_sort_order,
      ingredient: {
        id: row.i_id,
        name: row.i_name,
        name_normalized: row.i_name_normalized,
        category: row.i_category,
        instacart_product_id: row.i_instacart_product_id,
        instacart_upc: row.i_instacart_upc,
        default_unit: row.i_default_unit,
        allergens: row.i_allergens ?? [],
        nutrition_per_100g: (row.i_nutrition_per_100g ?? {}) as Ingredient['nutrition_per_100g'],
        is_active: row.i_is_active,
        created_at: row.i_created_at,
      },
    };
    recipe.recipe_ingredients.push(ri);
  }

  return recipe;
}

export async function findById(pool: pg.Pool, id: string): Promise<RecipeWithIngredients | null> {
  const { rows } = await pool.query<RecipeJoinRow>(
    `SELECT
       r.id, r.base_diet_id, r.title, r.slug, r.description, r.meal_type,
       r.prep_time_min, r.cook_time_min, r.servings, r.difficulty,
       r.nutrition, r.instructions, r.tips, r.image_url, r.video_url,
       r.is_active, r.created_at, r.updated_at, r.citations,
       ri.id         AS ri_id,
       ri.ingredient_id AS ri_ingredient_id,
       ri.quantity   AS ri_quantity,
       ri.unit       AS ri_unit,
       ri.preparation AS ri_preparation,
       ri.is_optional AS ri_is_optional,
       ri.sort_order AS ri_sort_order,
       i.id          AS i_id,
       i.name        AS i_name,
       i.name_normalized AS i_name_normalized,
       i.category    AS i_category,
       i.instacart_product_id AS i_instacart_product_id,
       i.instacart_upc AS i_instacart_upc,
       i.default_unit AS i_default_unit,
       i.allergens   AS i_allergens,
       i.nutrition_per_100g AS i_nutrition_per_100g,
       i.is_active   AS i_is_active,
       i.created_at  AS i_created_at
     FROM recipes r
     LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
     LEFT JOIN ingredients i ON i.id = ri.ingredient_id AND i.is_active = TRUE
     WHERE r.id = $1 AND r.is_active = TRUE
     ORDER BY ri.sort_order ASC`,
    [id],
  );

  return assembleRecipe(rows);
}

// Plan 22 · Phase D3 — batch fetch by id list for plan-preview aggregation.
// Single query using `WHERE id = ANY($1)` to avoid N+1 across preview screens.
export async function findByIds(
  pool: pg.Pool,
  ids: readonly string[],
): Promise<RecipeWithIngredients[]> {
  if (ids.length === 0) return [];
  const { rows } = await pool.query<RecipeJoinRow>(
    `SELECT
       r.id, r.base_diet_id, r.title, r.slug, r.description, r.meal_type,
       r.prep_time_min, r.cook_time_min, r.servings, r.difficulty,
       r.nutrition, r.instructions, r.tips, r.image_url, r.video_url,
       r.is_active, r.created_at, r.updated_at, r.citations,
       ri.id         AS ri_id,
       ri.ingredient_id AS ri_ingredient_id,
       ri.quantity   AS ri_quantity,
       ri.unit       AS ri_unit,
       ri.preparation AS ri_preparation,
       ri.is_optional AS ri_is_optional,
       ri.sort_order AS ri_sort_order,
       i.id          AS i_id,
       i.name        AS i_name,
       i.name_normalized AS i_name_normalized,
       i.category    AS i_category,
       i.instacart_product_id AS i_instacart_product_id,
       i.instacart_upc AS i_instacart_upc,
       i.default_unit AS i_default_unit,
       i.allergens   AS i_allergens,
       i.nutrition_per_100g AS i_nutrition_per_100g,
       i.is_active   AS i_is_active,
       i.created_at  AS i_created_at
     FROM recipes r
     LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
     LEFT JOIN ingredients i ON i.id = ri.ingredient_id AND i.is_active = TRUE
     WHERE r.id = ANY($1::uuid[]) AND r.is_active = TRUE
     ORDER BY r.id ASC, ri.sort_order ASC`,
    [ids as string[]],
  );

  const grouped = new Map<string, RecipeJoinRow[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.id);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(row.id, [row]);
    }
  }

  const out: RecipeWithIngredients[] = [];
  for (const bucket of grouped.values()) {
    const assembled = assembleRecipe(bucket);
    if (assembled) out.push(assembled);
  }
  return out;
}

export async function findByBaseDietId(
  pool: pg.Pool,
  baseDietId: string,
  opts: ListRecipesOptions,
): Promise<ListResult<Recipe>> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  const whereClauses: string[] = ['base_diet_id = $1', 'is_active = TRUE'];
  const values: unknown[] = [baseDietId];

  if (opts.meal_type !== undefined) {
    values.push(opts.meal_type);
    whereClauses.push(`meal_type = $${String(values.length)}`);
  }
  if (opts.cursor !== undefined) {
    values.push(opts.cursor);
    whereClauses.push(`id > $${String(values.length)}`);
  }

  values.push(limit + 1);
  const limitParam = `$${String(values.length)}`;

  const sql = `SELECT * FROM recipes WHERE ${whereClauses.join(' AND ')} ORDER BY id ASC LIMIT ${limitParam}`;

  const { rows } = await pool.query<Recipe>(sql, values);

  const hasNext = rows.length > limit;
  const items = rows.slice(0, limit);
  const nextCursor = hasNext ? (items[items.length - 1]?.id ?? null) : null;

  return { items, has_next: hasNext, next_cursor: nextCursor };
}
