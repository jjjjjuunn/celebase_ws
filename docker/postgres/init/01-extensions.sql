-- Runs automatically on first docker compose up (empty volume only).
-- Creates extensions required by db/migrations/0001_initial-schema.sql.
CREATE EXTENSION IF NOT EXISTS "pg_uuidv7";
