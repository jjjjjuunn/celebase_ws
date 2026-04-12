-- Migration: 0002_phi-encryption-columns
-- Description: Change PHI columns from structured types to TEXT for application-level AES-256-GCM encryption.
-- Affected: bio_profiles.medical_conditions (TEXT[] → TEXT), medications (TEXT[] → TEXT), biomarkers (JSONB → TEXT)
-- Note: MVP has no production data. Encrypted values stored as base64 envelope strings.

ALTER TABLE bio_profiles
  ALTER COLUMN medical_conditions TYPE TEXT USING NULL,
  ALTER COLUMN medications TYPE TEXT USING NULL,
  ALTER COLUMN biomarkers TYPE TEXT USING NULL;

ALTER TABLE bio_profiles
  ALTER COLUMN medical_conditions SET DEFAULT NULL,
  ALTER COLUMN medications SET DEFAULT NULL,
  ALTER COLUMN biomarkers SET DEFAULT NULL;
