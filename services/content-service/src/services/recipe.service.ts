import type pg from 'pg';
import type { Recipe } from '@celebbase/shared-types';
import { NotFoundError } from '@celebbase/service-core';
import * as recipeRepo from '../repositories/recipe.repository.js';
import * as baseDietRepo from '../repositories/baseDiet.repository.js';
import type { RecipeWithIngredients, ListRecipesOptions } from '../repositories/recipe.repository.js';
import type { ListResult } from '../repositories/celebrity.repository.js';

export interface PersonalizedRecipe extends RecipeWithIngredients {
  allergen_conflicts: string[];
}

export async function getRecipe(pool: pg.Pool, id: string): Promise<RecipeWithIngredients> {
  const recipe = await recipeRepo.findById(pool, id);
  if (!recipe) throw new NotFoundError('Recipe not found');
  return recipe;
}

export async function listByBaseDiet(
  pool: pg.Pool,
  baseDietId: string,
  opts: ListRecipesOptions,
): Promise<ListResult<Recipe>> {
  const diet = await baseDietRepo.findById(pool, baseDietId);
  if (!diet) throw new NotFoundError('BaseDiet not found');
  return recipeRepo.findByBaseDietId(pool, baseDietId, opts);
}

export async function getPersonalized(
  pool: pg.Pool,
  id: string,
  allergies: string[],
): Promise<PersonalizedRecipe> {
  const recipe = await getRecipe(pool, id);

  const normalizedAllergies = allergies.map((a) => a.toLowerCase().trim());

  const allergenConflicts: string[] = [];
  for (const ri of recipe.recipe_ingredients) {
    const ingredientAllergens = ri.ingredient.allergens.map((a) => a.toLowerCase().trim());
    for (const allergen of normalizedAllergies) {
      if (ingredientAllergens.includes(allergen) && !allergenConflicts.includes(allergen)) {
        allergenConflicts.push(allergen);
      }
    }
  }

  return { ...recipe, allergen_conflicts: allergenConflicts };
}
