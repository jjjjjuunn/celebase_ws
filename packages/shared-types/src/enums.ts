import { z } from 'zod';

// spec §3.4 Standard Enum Glossary — 모든 값은 spec과 정확히 일치해야 함

export const ActivityLevel = z.enum([
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
]);
export type ActivityLevel = z.infer<typeof ActivityLevel>;

export const PrimaryGoal = z.enum([
  'weight_loss',
  'muscle_gain',
  'maintenance',
  'longevity',
  'energy',
  'gut_health',
  'skin_health',
  'athletic_performance',
  'glp1_support',
]);
export type PrimaryGoal = z.infer<typeof PrimaryGoal>;

export const DietType = z.enum([
  'omnivore',
  'pescatarian',
  'vegetarian',
  'vegan',
  'keto',
  'paleo',
]);
export type DietType = z.infer<typeof DietType>;

export const MealType = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'smoothie',
]);
export type MealType = z.infer<typeof MealType>;

export const CelebrityCategory = z.enum([
  'diet',
  'protein',
  'vegetarian',
  'general',
]);
export type CelebrityCategory = z.infer<typeof CelebrityCategory>;

export const SubscriptionTier = z.enum(['free', 'premium', 'elite']);
export type SubscriptionTier = z.infer<typeof SubscriptionTier>;

export const MealPlanStatus = z.enum([
  'queued',
  'generating',
  'draft',
  'active',
  'completed',
  'failed',
  'expired',
  'archived',
]);
export type MealPlanStatus = z.infer<typeof MealPlanStatus>;

export const StressLevel = z.enum(['low', 'moderate', 'high']);
export type StressLevel = z.infer<typeof StressLevel>;

export const OrderStatus = z.enum([
  'pending',
  'submitted',
  'confirmed',
  'delivered',
  'cancelled',
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const SubscriptionStatus = z.enum([
  'active',
  'past_due',
  'cancelled',
  'expired',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const PhiAction = z.enum(['READ', 'WRITE', 'DELETE']);
export type PhiAction = z.infer<typeof PhiAction>;

export const RecipeDifficulty = z.enum(['easy', 'medium', 'hard']);
export type RecipeDifficulty = z.infer<typeof RecipeDifficulty>;

export const Sex = z.enum(['male', 'female', 'other', 'prefer_not_to_say']);
export type Sex = z.infer<typeof Sex>;
