-- 0026_lifestyle_claims_celebrity_optional.sql
-- Make lifestyle_claims.celebrity_id NULLABLE so a wellness trend card can exist
-- WITHOUT a celebrity (celebase pivot: celebrity-optional wellness trend card news —
-- celebrity is woven in as the key that unlocks "Make my Plan", not a hard requirement).
-- celebrity_id stays a FK (ON DELETE RESTRICT). The partial index idx_lifestyle_claims_celeb
-- and the cascade_celebrity_deactivate trigger (0015) remain correct: NULL celebrity_id rows
-- are simply not matched by `WHERE celebrity_id = NEW.id` and carry a NULL key in the index.
-- Forward-only: DROP NOT NULL is a metadata-only, 0-downtime change (no table rewrite);
-- existing rows with a celebrity are unaffected. Rollback = a new forward migration.
-- IMPL-MOBILE-TREND-CARD-CELEB-OPTIONAL-001.
BEGIN;

ALTER TABLE lifestyle_claims ALTER COLUMN celebrity_id DROP NOT NULL;

COMMIT;
