-- Migration: 0011_recipes-citation-columns.sql
-- Spec: §5.8 LLM Enhancement Layer — Citation 컬럼 추가
-- IMPL-AI-001-b
-- 0-downtime: ADD COLUMN ... DEFAULT '[]' (기존 행 자동 채움)

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]';

ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN recipes.citations
  IS 'LLM-generated citation array (spec §5.8). Element schema: CitationSchema[]. min_length=1 enforced at application layer for LLM-mode plans.';

COMMENT ON COLUMN ingredients.citations
  IS 'Source citations for ingredient nutritional data (spec §5.8). Element schema: CitationSchema[].';
