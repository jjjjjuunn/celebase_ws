-- Migration: 0008_processed-events
-- Description: Idempotency ledger for Stripe webhook deduplication
--   shared between user-service and commerce-service during cutover overlap

CREATE TABLE processed_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    stripe_event_id     VARCHAR(100) NOT NULL,
    event_type          VARCHAR(100) NOT NULL,
    processed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload_hash        CHAR(64) NOT NULL,
    result              VARCHAR(20) NOT NULL
                        CHECK (result IN ('applied','skipped','error')),
    error_message       TEXT,
    CONSTRAINT uq_processed_events_stripe_id UNIQUE (stripe_event_id)
);

-- Retention query index
CREATE INDEX idx_processed_events_processed_at
    ON processed_events (processed_at DESC);

-- Explicit B-tree index for stripe_event_id skip-path lookup
-- (UNIQUE constraint already creates an implicit index, but naming it
--  makes intent clear and allows targeted drop/rebuild)
CREATE INDEX idx_processed_events_stripe_event_id
    ON processed_events (stripe_event_id);
