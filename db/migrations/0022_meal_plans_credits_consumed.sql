-- Migration: 0022_meal_plans_credits_consumed
-- Description: IMPL-MEAL-CREDIT-001-a — credit model for meal-plan generation.
--   (1) Add credits_consumed column (1 credit = 1 day; an N-day plan costs N).
--   (2) Backfill existing rows from inclusive day count (end_date - start_date + 1).
--   (3) Add credit-accounting index (deleted_at INTENTIONALLY excluded — see below).
--   (4) Drop idx_meal_plans_quota_count (sole consumer count_plans_this_month is removed).
--
-- IMPORTANT: CREATE/DROP INDEX CONCURRENTLY cannot run inside a transaction block.
--   This file uses NO explicit BEGIN/COMMIT — each statement runs in its own
--   autocommit transaction (consistent with 0006, 0007, 0010, 0012, 0017).
--
-- Credit accounting (IMPL-MEAL-CREDIT-001):
--   consumed = SUM(credits_consumed) WHERE status <> 'failed'
--   - deleted_at is NOT filtered → deleting a plan does NOT refund credits
--     (closes generate→delete→regenerate gaming; matches industry credit norm).
--   - only status='failed' is excluded → failed generation is refunded.
--   This differs from the legacy quota index predicate
--   (WHERE deleted_at IS NULL AND status <> 'failed'), so the credit index below
--   omits the deleted_at clause.

-- (1) Add column. NOT NULL DEFAULT <const> is a metadata-only change on PG11+
--     (no full-table rewrite, brief lock only).
ALTER TABLE meal_plans
    ADD COLUMN IF NOT EXISTS credits_consumed INTEGER NOT NULL DEFAULT 1
    CHECK (credits_consumed >= 0);

-- (2) Backfill from inclusive day span. NULL guard is REQUIRED: legacy/draft rows
--     may have NULL start_date/end_date — writing NULL would violate the NOT NULL
--     constraint and abort the migration. Those rows keep the DEFAULT 1.
UPDATE meal_plans
   SET credits_consumed = (end_date - start_date + 1)
 WHERE start_date IS NOT NULL
   AND end_date IS NOT NULL;

-- (3) Credit-accounting index. Includes credits_consumed as a payload column so the
--     lifetime/monthly SUM can be served by an index-only scan. Partial predicate
--     matches the accounting rule (status <> 'failed'; deleted_at intentionally omitted).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meal_plans_credits
    ON meal_plans (user_id, created_at, credits_consumed)
    WHERE status <> 'failed';

-- (4) Drop the legacy monthly-plan-count index. Its sole consumer,
--     count_plans_this_month, is removed in this change. The plan-list query uses
--     an id-cursor (ORDER BY id), and idempotency lookups use
--     idx_meal_plans_idempotency — neither relies on this index.
DROP INDEX CONCURRENTLY IF EXISTS idx_meal_plans_quota_count;
