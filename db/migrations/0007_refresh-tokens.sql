-- Migration: 0007_refresh-tokens
-- Description: Phase C stateful token revocation (IMPL-010-f)
-- IMPORTANT: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--   Run each statement separately or use a migration runner that handles this.

CREATE TABLE refresh_tokens (
  jti             UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ NULL,
  revoked_reason  VARCHAR(32) NULL CHECK (revoked_reason IN ('logout', 'rotated', 'reuse_detected')),
  rotated_to_jti  UUID NULL REFERENCES refresh_tokens(jti),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_tokens_user_active
  ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_tokens_expires
  ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;
