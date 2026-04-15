-- Migration: 0006_quota-enforcement
-- Description: Add idempotency_key column to meal_plans + supporting indexes
--   for IMPL-013 subscription quota enforcement.
-- IMPORTANT: Run each statement outside a transaction (CONCURRENTLY requires it).

-- Step 1: Add idempotency_key column (nullable — pre-existing rows get NULL)
ALTER TABLE meal_plans
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64);

-- Step 2: Index for idempotency lookup (user_id + key + recency)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meal_plans_idempotency
    ON meal_plans(user_id, idempotency_key, created_at DESC)
    WHERE deleted_at IS NULL AND status <> 'failed';

-- Step 3: Index for monthly quota count query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meal_plans_quota_count
    ON meal_plans(user_id, created_at)
    WHERE deleted_at IS NULL AND status <> 'failed';
