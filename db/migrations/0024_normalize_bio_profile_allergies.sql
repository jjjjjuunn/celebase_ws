-- Migration: 0024_normalize_bio_profile_allergies
-- Description: CHORE-ALLERGEN-VOCAB-001 — backfill existing bio_profiles.allergies
--   and .intolerances to the canonical recipe-tag vocabulary so the meal-plan
--   engine's exact-match allergen filter actually blocks them.
--
--   Rows stored before this change hold client display LABELS (e.g. 'Milk',
--   'Wheat (gluten)', 'Wheat / gluten') that never matched the ingredient
--   allergen tags ('dairy','wheat','gluten') — so those allergies silently
--   failed to filter. This re-maps them to tokens, mirroring the TS
--   normalizeAllergies() now applied at the write path.
--
--   allergies / intolerances are plaintext TEXT[] (NOT encrypted PHI — only
--   medical_conditions / medications / biomarkers are AES-256 encrypted), so a
--   SQL transform is safe and correct here.
--
--   Mapping (case-insensitive on each element; recognized forms → full canonical
--   tag set, unknown custom entries preserved trimmed with original case):
--     milk, milk / dairy, dairy            -> {dairy}
--     wheat (gluten), wheat / gluten,
--       wheat, gluten                       -> {gluten, wheat}
--     peanuts | tree nuts | eggs | soy |
--       shellfish | fish | sesame           -> itself (lowercased tag)
--     anything else                         -> preserved (trimmed)
--
--   IDEMPOTENT: canonical tokens map to themselves and the outer ARRAY(...) uses
--   SELECT DISTINCT, so re-running (or running after a partial apply) is stable.
--   No explicit BEGIN/COMMIT — each statement autocommits (consistent with
--   0017/0022/0023). Forward-only.

UPDATE bio_profiles
SET allergies = (
  SELECT ARRAY(
    SELECT DISTINCT canonical
    FROM unnest(allergies) AS elem
    CROSS JOIN LATERAL unnest(
      CASE
        WHEN lower(trim(elem)) IN ('milk', 'milk / dairy', 'dairy') THEN ARRAY['dairy']
        WHEN lower(trim(elem)) IN ('wheat (gluten)', 'wheat / gluten', 'wheat', 'gluten') THEN ARRAY['gluten', 'wheat']
        WHEN lower(trim(elem)) = 'peanuts' THEN ARRAY['peanuts']
        WHEN lower(trim(elem)) IN ('tree nuts', 'tree_nuts') THEN ARRAY['tree nuts']
        WHEN lower(trim(elem)) = 'eggs' THEN ARRAY['eggs']
        WHEN lower(trim(elem)) = 'soy' THEN ARRAY['soy']
        WHEN lower(trim(elem)) = 'shellfish' THEN ARRAY['shellfish']
        WHEN lower(trim(elem)) = 'fish' THEN ARRAY['fish']
        WHEN lower(trim(elem)) = 'sesame' THEN ARRAY['sesame']
        ELSE ARRAY[trim(elem)]
      END
    ) AS canonical
    ORDER BY canonical
  )
)
WHERE allergies IS NOT NULL AND array_length(allergies, 1) > 0;

UPDATE bio_profiles
SET intolerances = (
  SELECT ARRAY(
    SELECT DISTINCT canonical
    FROM unnest(intolerances) AS elem
    CROSS JOIN LATERAL unnest(
      CASE
        WHEN lower(trim(elem)) IN ('milk', 'milk / dairy', 'dairy') THEN ARRAY['dairy']
        WHEN lower(trim(elem)) IN ('wheat (gluten)', 'wheat / gluten', 'wheat', 'gluten') THEN ARRAY['gluten', 'wheat']
        WHEN lower(trim(elem)) = 'peanuts' THEN ARRAY['peanuts']
        WHEN lower(trim(elem)) IN ('tree nuts', 'tree_nuts') THEN ARRAY['tree nuts']
        WHEN lower(trim(elem)) = 'eggs' THEN ARRAY['eggs']
        WHEN lower(trim(elem)) = 'soy' THEN ARRAY['soy']
        WHEN lower(trim(elem)) = 'shellfish' THEN ARRAY['shellfish']
        WHEN lower(trim(elem)) = 'fish' THEN ARRAY['fish']
        WHEN lower(trim(elem)) = 'sesame' THEN ARRAY['sesame']
        ELSE ARRAY[trim(elem)]
      END
    ) AS canonical
    ORDER BY canonical
  )
)
WHERE intolerances IS NOT NULL AND array_length(intolerances, 1) > 0;
