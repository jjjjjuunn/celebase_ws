// Wellness-log feature barrel. Dashboard rings + Identity Sync Score
// surfaces live here. NutritionRing comes from ui-kit; IdentitySyncScore
// is a dashboard-local composite added alongside this barrel.
export { NutritionRing, MealCard } from '@celebbase/ui-kit';
export type {
  NutritionRingProps,
  NutritionRingSize,
  NutritionRingTone,
  MealCardProps,
} from '@celebbase/ui-kit';
export { IdentitySyncScore } from './IdentitySyncScore.js';
export type { IdentitySyncScoreProps } from './IdentitySyncScore.js';
