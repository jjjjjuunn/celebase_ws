-- Migration: 0017_processed_events_partial_unique
-- Description: IMPL-MOBILE-PAY-001a-2 — processed_events expand phase 1a-2.
--   (1) Backfill existing rows: provider='stripe', event_id=stripe_event_id
--   (2) Add CHECK constraint validating provider whitelist (NULL-tolerant)
--   (3) Add partial UNIQUE index on (provider, event_id) WHERE provider IS NOT NULL
--
-- IMPORTANT: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--   This file uses NO explicit BEGIN/COMMIT — each statement runs in its own
--   autocommit transaction (consistent with 0006, 0007, 0010, 0012).
--
-- The partial UNIQUE replaces the role of stripe_event_id UNIQUE for new rows
-- once IMPL-MOBILE-PAY-001b switches the ON CONFLICT target. Until that point,
-- stripe_event_id UNIQUE remains the active idempotency mechanism.

-- (1) Backfill — set provider/event_id for any rows still NULL after 1a's
--     dual-write activation (rows inserted before PR #37 was deployed).
UPDATE processed_events
   SET provider = 'stripe',
       event_id = stripe_event_id
 WHERE provider IS NULL
    OR event_id IS NULL;

-- (2) CHECK constraint (NULL-tolerant — matches partial UNIQUE design).
--     ALTER TABLE ADD CONSTRAINT briefly takes ACCESS EXCLUSIVE but is fast:
--     PostgreSQL only validates existing rows, no full-table rewrite.
ALTER TABLE processed_events
  ADD CONSTRAINT processed_events_provider_check
  CHECK (provider IS NULL OR provider IN ('stripe', 'revenuecat'));

-- (3) Partial UNIQUE index — created CONCURRENTLY for online build.
--     WHERE provider IS NOT NULL future-proofs against any unexpected NULL
--     slipping through and aligns with the NULL-tolerant CHECK above.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_processed_events_provider_event_id
  ON processed_events (provider, event_id)
  WHERE provider IS NOT NULL;
