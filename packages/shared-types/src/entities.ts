// spec §3.1 Core Entity Row Types
// DB 쿼리 결과 타입으로 사용: db.query<User>('SELECT * FROM users WHERE id = $1', [id])
// JSONB 컬럼 타입은 ./jsonb/index.ts 참조
// enum 타입은 ./enums.ts 참조

import type {
  ActivityLevel,
  CelebrityCategory,
  DietType,
  MealPlanStatus,
  MealType,
  OrderStatus,
  PhiAction,
  PrimaryGoal,
  RecipeDifficulty,
  StressLevel,
  SubscriptionStatus,
  SubscriptionTier,
} from './enums.js';
import type {
  Biomarkers,
  DailyPlan,
  MacroRatio,
  MacroTargets,
  Nutrition,
  QuotaOverride,
  SourceRef,
} from './jsonb/index.js';

// ── users ──────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  cognito_sub: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  subscription_tier: SubscriptionTier;
  locale: string;
  timezone: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// ── bio_profiles ───────────────────────────────────────────────────────────

export interface BioProfile {
  id: string;
  user_id: string;

  // Physical Metrics
  birth_year: number | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  waist_cm: number | null;
  body_fat_pct: number | null;

  // Activity & Lifestyle
  activity_level: ActivityLevel | null;
  sleep_hours_avg: number | null;
  stress_level: StressLevel | null;

  // Health Data (PHI — AES-256 암호화 대상)
  allergies: string[];
  intolerances: string[];
  medical_conditions: string[]; // PHI
  medications: string[];        // PHI
  biomarkers: Biomarkers;       // PHI

  // Wellness Goals
  primary_goal: PrimaryGoal | null;
  secondary_goals: string[];

  // Dietary Preferences
  diet_type: DietType | null;
  cuisine_preferences: string[];
  disliked_ingredients: string[];

  // Calculated Fields (by AI Engine)
  bmr_kcal: number | null;
  tdee_kcal: number | null;
  target_kcal: number | null;
  macro_targets: MacroTargets;

  version: number;
  created_at: Date;
  updated_at: Date;
}

// ── celebrities ────────────────────────────────────────────────────────────

export interface Celebrity {
  id: string;
  slug: string;
  display_name: string;
  short_bio: string | null;
  avatar_url: string;
  cover_image_url: string | null;
  category: CelebrityCategory;
  tags: string[];
  is_featured: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ── base_diets ─────────────────────────────────────────────────────────────

export interface BaseDiet {
  id: string;
  celebrity_id: string;
  name: string;
  description: string | null;
  philosophy: string | null;
  diet_type: DietType;
  avg_daily_kcal: number | null;
  macro_ratio: MacroRatio;
  included_foods: string[];
  excluded_foods: string[];
  key_supplements: string[];
  source_refs: SourceRef[];
  verified_by: string | null;
  last_verified_at: Date;
  version: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ── recipes ────────────────────────────────────────────────────────────────

export interface Recipe {
  id: string;
  base_diet_id: string;
  title: string;
  slug: string;
  description: string | null;
  meal_type: MealType;
  prep_time_min: number | null;
  cook_time_min: number | null;
  servings: number;
  difficulty: RecipeDifficulty | null;
  nutrition: Nutrition;
  instructions: Array<{ step: number; text: string; duration_min: number | null }>;
  tips: string | null;
  image_url: string | null;
  video_url: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ── ingredients ────────────────────────────────────────────────────────────

export interface Ingredient {
  id: string;
  name: string;
  name_normalized: string;
  category: string | null;
  instacart_product_id: string | null;
  instacart_upc: string | null;
  default_unit: string | null;
  allergens: string[];
  nutrition_per_100g: Partial<Nutrition>;
  is_active: boolean;
  created_at: Date;
}

// ── recipe_ingredients ─────────────────────────────────────────────────────

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  preparation: string | null;
  is_optional: boolean;
  sort_order: number;
}

// ── meal_plans ─────────────────────────────────────────────────────────────

export interface MealPlan {
  id: string;
  user_id: string;
  base_diet_id: string;
  name: string | null;
  status: MealPlanStatus;
  adjustments: MealPlanAdjustments;
  start_date: string; // DATE — ISO 8601 'YYYY-MM-DD'
  end_date: string;   // DATE — ISO 8601 'YYYY-MM-DD'
  daily_plans: DailyPlan[];
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface MealPlanSubstitution {
  original_ingredient_id: string;
  substitute_ingredient_id: string;
  reason: string;
}

export interface MealPlanAdjustments {
  calorie_adjustment_pct?: number;
  protein_boost_g?: number;
  removed_allergens?: string[];
  substitutions?: MealPlanSubstitution[];
  added_supplements?: string[];
}

// ── instacart_orders ───────────────────────────────────────────────────────

export interface InstacartOrderItem {
  ingredient_id: string;
  instacart_product_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  estimated_price_usd: number | null;
}

export interface InstacartOrder {
  id: string;
  user_id: string;
  meal_plan_id: string;
  instacart_order_id: string | null;
  status: OrderStatus;
  items: InstacartOrderItem[];
  subtotal_usd: number | null;
  delivery_fee_usd: number | null;
  total_usd: number | null;
  delivery_address_id: string | null;
  scheduled_delivery: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── subscriptions ──────────────────────────────────────────────────────────

export interface Subscription {
  id: string;
  user_id: string;
  tier: Exclude<SubscriptionTier, 'free'>; // subscriptions 테이블은 premium/elite만
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  status: SubscriptionStatus;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  quota_override: QuotaOverride;
  created_at: Date;
  updated_at: Date;
}

// ── daily_logs ─────────────────────────────────────────────────────────────

export interface DailyLog {
  id: string;
  user_id: string;
  log_date: string; // DATE — ISO 8601 'YYYY-MM-DD'
  meals_completed: { breakfast?: boolean; lunch?: boolean; dinner?: boolean; snack?: boolean };
  weight_kg: number | null;
  energy_level: 1 | 2 | 3 | 4 | 5 | null;
  mood: 1 | 2 | 3 | 4 | 5 | null;
  sleep_quality: 1 | 2 | 3 | 4 | 5 | null;
  notes: string | null;
  created_at: Date;
}

// ── diet_view_events ───────────────────────────────────────────────────────

export interface DietViewEvent {
  id: string;
  user_id: string;
  base_diet_id: string;
  viewed_at: Date;
}

// ── phi_access_logs ────────────────────────────────────────────────────────

export interface PhiAccessLog {
  id: string;
  user_id: string; // FK 없음 — 유저 삭제 후에도 HIPAA 6년 보관
  accessed_by: string;
  action: PhiAction;
  phi_fields: string[];
  purpose: string;
  request_id: string | null;
  ip_address: string | null;
  created_at: Date;
  retention_until: Date;
}
