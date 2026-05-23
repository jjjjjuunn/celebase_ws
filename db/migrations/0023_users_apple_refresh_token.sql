-- Migration: 0023_users_apple_refresh_token
-- Description: FEAT-APPLE-REVOKE-001 — store the Apple refresh_token (encrypted)
--   so DELETE /users/me can call Apple's token revocation endpoint
--   (App Store Guideline 4.8.1 — Sign in with Apple deletion compliance).
--
--   The column holds the AES-256-GCM envelope (base64) produced by
--   @celebbase/service-core encryptField (per-user DEK via HKDF), NOT the raw
--   token. Nullable: only Apple-authed users whose authorization-code exchange
--   succeeded have a value; email/password + Google users stay NULL.
--
--   ADD COLUMN nullable (no default) is an instant catalog-only change on PG11+
--   (no table rewrite, lock-safe). No explicit BEGIN/COMMIT — each statement
--   autocommits (consistent with 0017/0022).

ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_refresh_token_enc TEXT;
