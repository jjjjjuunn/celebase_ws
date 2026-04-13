import type pg from 'pg';
import type { SeedCelebrity, SeedRecipe } from '../types.js';
import { resolveIngredientId } from './ingredientLoader.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function upsertCelebrity(
  client: pg.PoolClient,
  celeb: SeedCelebrity,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO celebrities (slug, display_name, short_bio, avatar_url, cover_image_url, category, tags, is_featured, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (slug) DO NOTHING
     RETURNING id`,
    [
      celeb.slug, celeb.display_name, celeb.short_bio,
      celeb.avatar_url, celeb.cover_image_url,
      celeb.category, celeb.tags, celeb.is_featured, celeb.sort_order,
    ],
  );

  if (rows[0]) return rows[0].id;

  const existing = await client.query<{ id: string }>(
    'SELECT id FROM celebrities WHERE slug = $1',
    [celeb.slug],
  );
  if (!existing.rows[0]) throw new Error(`Celebrity insert failed: ${celeb.slug}`);
  return existing.rows[0].id;
}

async function upsertBaseDiet(
  client: pg.PoolClient,
  celebrityId: string,
  diet: SeedCelebrity['base_diet'],
): Promise<string> {
  // Check existence (no unique constraint on base_diets)
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM base_diets WHERE celebrity_id = $1 AND name = $2 LIMIT 1',
    [celebrityId, diet.name],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO base_diets (celebrity_id, name, description, philosophy, diet_type, avg_daily_kcal, macro_ratio, included_foods, excluded_foods, key_supplements, source_refs)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      celebrityId, diet.name, diet.description, diet.philosophy,
      diet.diet_type, diet.avg_daily_kcal,
      JSON.stringify(diet.macro_ratio),
      diet.included_foods, diet.excluded_foods, diet.key_supplements,
      JSON.stringify(diet.source_refs),
    ],
  );
  if (!rows[0]) throw new Error(`Base diet insert failed: ${diet.name}`);
  return rows[0].id;
}

async function upsertRecipe(
  client: pg.PoolClient,
  baseDietId: string,
  celebSlug: string,
  recipe: SeedRecipe,
  ingredientMap: Map<string, string>,
): Promise<void> {
  const recipeSlug = `${celebSlug}-${slugify(recipe.title)}`;

  // Check existence
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM recipes WHERE base_diet_id = $1 AND slug = $2 LIMIT 1',
    [baseDietId, recipeSlug],
  );
  if (existing.rows[0]) return;

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO recipes (base_diet_id, title, slug, meal_type, prep_time_min, cook_time_min, servings, difficulty, nutrition, instructions, tips)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      baseDietId, recipe.title, recipeSlug, recipe.meal_type,
      recipe.prep_time_min, recipe.cook_time_min, recipe.servings, recipe.difficulty,
      JSON.stringify(recipe.nutrition), JSON.stringify(recipe.instructions),
      recipe.tips ?? null,
    ],
  );
  if (!rows[0]) throw new Error(`Recipe insert failed: ${recipe.title}`);
  const recipeId = rows[0].id;

  // Insert recipe_ingredients
  for (let i = 0; i < recipe.ingredients.length; i++) {
    const ing = recipe.ingredients[i]!;
    const ingredientId = resolveIngredientId(ingredientMap, ing.ingredient_name);

    await client.query(
      `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, preparation, is_optional, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (recipe_id, ingredient_id) DO NOTHING`,
      [recipeId, ingredientId, ing.quantity, ing.unit, ing.preparation ?? null, ing.is_optional ?? false, i],
    );
  }
}

export async function loadCelebrity(
  client: pg.PoolClient,
  celeb: SeedCelebrity,
  ingredientMap: Map<string, string>,
): Promise<void> {
  const celebrityId = await upsertCelebrity(client, celeb);
  const baseDietId = await upsertBaseDiet(client, celebrityId, celeb.base_diet);

  for (const recipe of celeb.recipes) {
    await upsertRecipe(client, baseDietId, celeb.slug, recipe, ingredientMap);
  }
}
