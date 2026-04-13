import type pg from 'pg';
import type { SeedIngredient } from '../types.js';

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export async function loadIngredients(
  client: pg.PoolClient,
  ingredients: SeedIngredient[],
): Promise<Map<string, string>> {
  const nameToId = new Map<string, string>();

  for (const ing of ingredients) {
    const normalized = normalize(ing.name);

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO ingredients (name, name_normalized, category, allergens)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name_normalized) DO NOTHING
       RETURNING id`,
      [ing.name, normalized, ing.category, ing.allergens],
    );

    if (rows[0]) {
      nameToId.set(normalized, rows[0].id);
    } else {
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM ingredients WHERE name_normalized = $1',
        [normalized],
      );
      if (existing.rows[0]) {
        nameToId.set(normalized, existing.rows[0].id);
      }
    }
  }

  return nameToId;
}

export function resolveIngredientId(
  nameToId: Map<string, string>,
  ingredientName: string,
): string {
  const normalized = normalize(ingredientName);
  const id = nameToId.get(normalized);
  if (!id) {
    throw new Error(`Unknown ingredient: "${ingredientName}" (normalized: "${normalized}")`);
  }
  return id;
}
