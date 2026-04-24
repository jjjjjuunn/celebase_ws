-- Plan 20-vast-adleman · Phase C-0 (H2)
-- Adds soft reference from users to celebrities.slug for persona-first
-- onboarding + Identity Sync Score (Phase E).
--
-- Service-boundary note (CLAUDE.md Rule #10): users is owned by user-service
-- and celebrities is owned by content-service. We intentionally DO NOT add a
-- cross-service FOREIGN KEY — see social-bot/celebrity_slug precedent in
-- .claude/rules/api-conventions.md. Slug validity is enforced in user-service
-- application code via content-service API lookup before writing.
--
-- 0-downtime: nullable column, no default, no backfill.

ALTER TABLE users
  ADD COLUMN preferred_celebrity_slug VARCHAR(100);

-- Partial index on the non-null subset (most users start with NULL).
-- Used by Phase E Identity Sync Score computation + dashboard "persona" theme lookup.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_preferred_celebrity
  ON users(preferred_celebrity_slug)
  WHERE preferred_celebrity_slug IS NOT NULL;

COMMENT ON COLUMN users.preferred_celebrity_slug IS
  'Celebrity slug selected during persona-first onboarding (plan Phase C). '
  'Soft reference to celebrities.slug — validated in user-service app code, '
  'no cross-service FK per Rule #10.';
