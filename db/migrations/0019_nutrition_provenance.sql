-- 0019_nutrition_provenance.sql
-- CelebBase P0 prerequisite: ingredient + recipe nutrition 출처 추적 컬럼 추가
-- (USDA FoodData Central backfill 의 provenance enforcement)

ALTER TABLE ingredients
  ADD COLUMN fdc_id INTEGER,
  ADD COLUMN nutrition_source VARCHAR(30)
    CHECK (nutrition_source IN ('usda_fdc', 'nih_ods', 'manual_verified')),
  ADD COLUMN nutrition_source_version VARCHAR(50),
  ADD COLUMN nutrition_updated_at TIMESTAMPTZ,
  ADD COLUMN portion_conversions JSONB DEFAULT '{}'::jsonb;

ALTER TABLE recipes
  ADD COLUMN nutrition_source VARCHAR(30) DEFAULT 'manual_legacy'
    CHECK (nutrition_source IN ('derived_from_ingredients', 'manual_verified', 'manual_legacy'));

-- fdc_id 부분 인덱스 (백필 완료 후 USDA lookup 가속)
CREATE INDEX CONCURRENTLY idx_ingredients_fdc_id
  ON ingredients(fdc_id) WHERE fdc_id IS NOT NULL;
