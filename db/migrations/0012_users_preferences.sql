-- Plan 22-vast-adleman · Phase C1
-- Adds user-level preferences JSONB column for silent-skip pantry carryover
-- and future preference storage. Schema is documented in
-- packages/shared-types/src/jsonb/user-preferences.ts.
--
-- Service boundary: users is owned by user-service. No cross-service FK.
-- Access pattern: RFC 7396 merge-patch via PATCH /users/me/preferences.
--
-- 0-downtime: NOT NULL with DEFAULT '{}' backfills existing rows atomically.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- GIN index on pantry path for efficient lookup when Plan 23 introduces
-- pantry-aware meal plan regeneration.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_preferences_pantry
  ON users
  USING gin ((preferences -> 'pantry'));

COMMENT ON COLUMN users.preferences IS
  'User-level UX preferences. Shape documented in '
  'packages/shared-types/src/jsonb/user-preferences.ts. '
  'Updated via PATCH /users/me/preferences (RFC 7396 merge-patch). '
  'Plan 22 (Phase C1) introduces pantry[] entries from silent-skip carryover.';
