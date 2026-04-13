-- Migration 0003: Add preferences column to meal_plans
-- 0-downtime safe: nullable column with default is metadata-only in PG 11+

ALTER TABLE meal_plans
    ADD COLUMN preferences JSONB DEFAULT '{}';

COMMENT ON COLUMN meal_plans.preferences
    IS 'User-supplied generation constraints: exclude_recipes, max_prep_time_min, budget_level, meal_types';
