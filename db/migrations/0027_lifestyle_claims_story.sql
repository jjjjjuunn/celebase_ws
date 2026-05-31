-- 0027_lifestyle_claims_story.sql
-- Add lifestyle_claims.story (JSONB, nullable) — 카드뉴스 6슬라이드 리치 카피의 단일 콘텐츠
-- 원본. 앱 캐러셀(ClaimDetailScreen)이 story 있으면 6슬라이드 리치본으로, 없으면(NULL) 하드코딩
-- 템플릿 fallback 으로 렌더한다. SNS 카드도 동일 story 를 소비한다(콘텐츠 1회 작성 = 양쪽 반영).
-- detail-only: 피드 리스트는 story 를 select 하지 않는다(payload lean).
-- Forward-only, nullable, default NULL → 기존 행 무영향(0-downtime, metadata-only).
-- (IMPL-MOBILE-CLAIM-STORY-SCHEMA-001 / 콘텐츠·디자인 핸드오프 2026-05-31)
ALTER TABLE lifestyle_claims ADD COLUMN story JSONB;

COMMENT ON COLUMN lifestyle_claims.story IS
  '카드뉴스 6슬라이드 리치 카피(JSON: hook/what/science?/catch/rescaled/cta). NULL이면 앱 템플릿 fallback. detail-only.';
