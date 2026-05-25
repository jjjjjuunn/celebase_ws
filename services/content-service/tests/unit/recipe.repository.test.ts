import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type pg from 'pg';
import { findByBaseDietId } from '../../src/repositories/recipe.repository.js';

interface QueryResult<T> {
  rows: T[];
}

type MockQuery = jest.Mock<(sql: string, values?: unknown[]) => Promise<QueryResult<unknown>>>;

function makePool(): { pool: pg.Pool; query: MockQuery } {
  const query = jest.fn() as MockQuery;
  const pool = { query } as unknown as pg.Pool;
  return { pool, query };
}

const BASE_DIET_ID = '01000000-0000-7000-8000-000000000001';
const RECIPE_ID = '01000000-0000-7000-8000-0000000000a1';

function makeRecipeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: RECIPE_ID,
    base_diet_id: BASE_DIET_ID,
    title: 'Cottage Cheese Bowl',
    slug: 'cottage-cheese-bowl',
    description: null,
    meal_type: 'breakfast',
    prep_time_min: 5,
    cook_time_min: 0,
    servings: 1,
    difficulty: 'easy',
    nutrition: {},
    instructions: [],
    tips: null,
    image_url: null,
    video_url: null,
    citations: [],
    nutrition_source: 'derived_from_ingredients',
    is_active: true,
    created_at: new Date('2026-04-01T12:00:00.000Z'),
    updated_at: new Date('2026-04-01T12:00:00.000Z'),
    allergens: ['dairy'],
    ...overrides,
  };
}

describe('recipe.repository findByBaseDietId', () => {
  let pool: pg.Pool;
  let query: MockQuery;

  beforeEach(() => {
    ({ pool, query } = makePool());
  });

  // Regression guard for FIX-MEAL-RECIPE-ALLERGEN-EXPOSURE-001: the list query the
  // meal-plan engine consumes MUST aggregate ingredient allergens. A revert to a bare
  // `SELECT * FROM recipes` (no allergen column) silently disables the engine's
  // allergen filter end-to-end, so assert the JOIN/aggregation is present in the SQL.
  it('aggregates ingredient allergens into a top-level allergens array', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await findByBaseDietId(pool, BASE_DIET_ID, {});

    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('recipe_ingredients');
    expect(sql).toContain('unnest(i.allergens)');
    expect(sql).toContain('array_agg(DISTINCT a');
    expect(sql).toContain('AS allergens');
    // must NOT regress to the allergen-less bare select
    expect(sql).not.toMatch(/SELECT\s+\*\s+FROM\s+recipes/i);

    const values = query.mock.calls[0]?.[1];
    expect(values).toEqual([BASE_DIET_ID, 21]); // default limit 20 → fetch limit+1
  });

  it('passes the aggregated allergens through to returned items', async () => {
    query.mockResolvedValueOnce({
      rows: [makeRecipeRow({ allergens: ['dairy', 'gluten'] })],
    });

    const result = await findByBaseDietId(pool, BASE_DIET_ID, {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.allergens).toEqual(['dairy', 'gluten']);
    expect(result.has_next).toBe(false);
    expect(result.next_cursor).toBeNull();
  });

  it('applies meal_type + cursor filters as bound params', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await findByBaseDietId(pool, BASE_DIET_ID, { meal_type: 'breakfast', cursor: RECIPE_ID, limit: 5 });

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('r.meal_type = $2');
    expect(sql).toContain('r.id > $3');
    expect(query.mock.calls[0]?.[1]).toEqual([BASE_DIET_ID, 'breakfast', RECIPE_ID, 6]);
  });
});
