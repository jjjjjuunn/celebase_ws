import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type pg from 'pg';

const mockFindById = jest.fn();
const mockFindByBaseDietId = jest.fn();
const mockBaseDietFindById = jest.fn();

jest.unstable_mockModule('../../src/repositories/recipe.repository.js', () => ({
  findById: mockFindById,
  findByBaseDietId: mockFindByBaseDietId,
}));

jest.unstable_mockModule('../../src/repositories/baseDiet.repository.js', () => ({
  findById: mockBaseDietFindById,
  findByCelebrityId: jest.fn(),
}));

const { getRecipe, listByBaseDiet, getPersonalized } = await import('../../src/services/recipe.service.js');
const { NotFoundError } = await import('@celebbase/service-core');

const baseIngredient = {
  id: 'ing-1',
  name: 'Almond Milk',
  name_normalized: 'almond milk',
  category: 'dairy-alternative',
  instacart_product_id: null,
  instacart_upc: null,
  default_unit: 'cup',
  allergens: ['tree_nuts'],
  nutrition_per_100g: {},
  is_active: true,
  created_at: new Date(),
};

const baseRecipeIngredient = {
  id: 'ri-1',
  recipe_id: 'recipe-1',
  ingredient_id: 'ing-1',
  quantity: 1,
  unit: 'cup',
  preparation: null,
  is_optional: false,
  sort_order: 0,
  ingredient: baseIngredient,
};

const baseRecipe = {
  id: 'recipe-1',
  base_diet_id: 'diet-1',
  title: 'Vegan Smoothie',
  slug: 'vegan-smoothie',
  description: null,
  meal_type: 'breakfast' as const,
  prep_time_min: 5,
  cook_time_min: null,
  servings: 1,
  difficulty: 'easy' as const,
  nutrition: { calories: 300, protein_g: 10, carbs_g: 40, fat_g: 8, fiber_g: 5, sugar_g: 20, sodium_mg: 100 },
  instructions: [{ step: 1, text: 'Blend all ingredients.', duration_min: 5 }],
  tips: null,
  image_url: null,
  video_url: null,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
  recipe_ingredients: [baseRecipeIngredient],
};

const baseDiet = {
  id: 'diet-1',
  celebrity_id: 'celeb-1',
  name: 'Plant-Based Reset',
  description: null,
  philosophy: null,
  diet_type: 'vegan' as const,
  avg_daily_kcal: 1800,
  macro_ratio: { protein_pct: 20, carbs_pct: 55, fat_pct: 25 },
  included_foods: [],
  excluded_foods: [],
  key_supplements: [],
  source_refs: [],
  verified_by: null,
  last_verified_at: new Date(),
  version: 1,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockPool = {} as pg.Pool;

describe('recipeService.getRecipe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns RecipeWithIngredients when id exists', async () => {
    mockFindById.mockResolvedValueOnce(baseRecipe);
    const result = await getRecipe(mockPool, 'recipe-1');
    expect(result).toEqual(baseRecipe);
    expect(result.recipe_ingredients).toHaveLength(1);
  });

  it('throws NotFoundError when id does not exist', async () => {
    mockFindById.mockResolvedValueOnce(null);
    await expect(getRecipe(mockPool, 'nonexistent')).rejects.toThrow(NotFoundError);
  });
});

describe('recipeService.listByBaseDiet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated recipes for valid baseDietId', async () => {
    mockBaseDietFindById.mockResolvedValueOnce(baseDiet);
    const listResult = {
      items: [{ ...baseRecipe, recipe_ingredients: undefined }],
      has_next: false,
      next_cursor: null,
    };
    mockFindByBaseDietId.mockResolvedValueOnce(listResult);
    const result = await listByBaseDiet(mockPool, 'diet-1', {});
    expect(result).toEqual(listResult);
  });

  it('throws NotFoundError when baseDietId does not exist', async () => {
    mockBaseDietFindById.mockResolvedValueOnce(null);
    await expect(listByBaseDiet(mockPool, 'nonexistent', {})).rejects.toThrow(NotFoundError);
  });
});

describe('recipeService.getPersonalized', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty allergen_conflicts when no match', async () => {
    mockFindById.mockResolvedValueOnce(baseRecipe);
    const result = await getPersonalized(mockPool, 'recipe-1', ['dairy']);
    expect(result.allergen_conflicts).toEqual([]);
  });

  it('returns allergen_conflicts when ingredient has matching allergen', async () => {
    mockFindById.mockResolvedValueOnce(baseRecipe);
    const result = await getPersonalized(mockPool, 'recipe-1', ['tree_nuts']);
    expect(result.allergen_conflicts).toContain('tree_nuts');
  });

  it('throws NotFoundError when recipe does not exist', async () => {
    mockFindById.mockResolvedValueOnce(null);
    await expect(getPersonalized(mockPool, 'nonexistent', [])).rejects.toThrow(NotFoundError);
  });
});
