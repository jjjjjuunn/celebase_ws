-- Migration: 0009_tier-sync-idempotency
-- Description: Idempotency ledger for commerce → user-service tier sync calls (24h TTL)

CREATE TABLE tier_sync_idempotency (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    idempotency_key VARCHAR(255) NOT NULL,
    user_id         UUID NOT NULL,
    tier            VARCHAR(20) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    CONSTRAINT uq_tier_sync_idempotency_key UNIQUE (idempotency_key)
);

-- Expiry scan index for cleanup job
CREATE INDEX idx_tier_sync_idempotency_expires
    ON tier_sync_idempotency (expires_at);
