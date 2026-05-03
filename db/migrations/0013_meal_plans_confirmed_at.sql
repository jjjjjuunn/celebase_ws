-- Plan 22 · Phase E — Post-login routing to Plan Preview
-- Guard for "has the user confirmed this draft plan?" — used by
-- PlanPreviewClient to avoid the draft↔active redirect loop.
--
-- Non-destructive: new column is NULLable with no default. Existing rows stay NULL
-- (unconfirmed). The PATCH /meal-plans/:id { status: 'active' } handler will
-- stamp confirmed_at = NOW() going forward (Phase E BFF flow).

ALTER TABLE meal_plans
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ NULL;
