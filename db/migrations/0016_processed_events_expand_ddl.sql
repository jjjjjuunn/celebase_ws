-- 0016_processed_events_expand_ddl.sql
-- IMPL-MOBILE-PAY-001a-1: processed_events expand phase 1a
-- Add provider + event_id columns (both NULL allowed) for RevenueCat dual-provider support.
-- Single transaction. No concurrently index. Fast metadata-only operation on PostgreSQL.

BEGIN;

ALTER TABLE processed_events
    ADD COLUMN IF NOT EXISTS provider TEXT,
    ADD COLUMN IF NOT EXISTS event_id TEXT;

COMMIT;
