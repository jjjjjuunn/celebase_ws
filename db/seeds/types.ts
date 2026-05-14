/** Seed data input shapes — NOT database entities. */

export interface SeedIngredient {
  name: string;
  category: string;
  allergens: string[];
  fdc_id?: number;
  portion_conversions?: Record<string, number>;
}

export interface SeedRecipeIngredient {
  ingredient_name: string;
  quantity: number;
  unit: string;
  preparation?: string;
  is_optional?: boolean;
}

export interface SeedRecipe {
  title: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'smoothie';
  prep_time_min: number;
  cook_time_min: number;
  servings: number;
  difficulty: 'easy' | 'medium' | 'hard';
  nutrition: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
    sodium_mg: number;
  };
  instructions: Array<{ step: number; text: string; duration_min: number | null }>;
  tips?: string;
  ingredients: SeedRecipeIngredient[];
}

export interface SeedBaseDiet {
  name: string;
  description: string;
  philosophy: string;
  diet_type: string;
  avg_daily_kcal: number;
  macro_ratio: { protein_pct: number; carbs_pct: number; fat_pct: number };
  included_foods: string[];
  excluded_foods: string[];
  key_supplements: string[];
  source_refs: Array<{ type: string; outlet: string; date: string; url?: string }>;
}

export interface SeedCelebrity {
  slug: string;
  display_name: string;
  short_bio: string;
  avatar_url: string;
  cover_image_url: string | null;
  category: 'diet' | 'protein' | 'vegetarian' | 'general';
  tags: string[];
  is_featured: boolean;
  sort_order: number;
  base_diet: SeedBaseDiet;
  recipes: SeedRecipe[];
}
