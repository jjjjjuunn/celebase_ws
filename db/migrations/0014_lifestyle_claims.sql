-- Plan 23 · PIVOT-2026-05 — LifestyleClaim foundation
-- Adds claim_type / trust_grade / claim_status enums + lifestyle_claims +
-- claim_sources tables. spec §3.5.3 / §9.3 안전·법적 7원칙 적용.
--
-- Forward-only. Rollback via new migration if needed.

-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE claim_type AS ENUM (
  'food',
  'workout',
  'sleep',
  'beauty',
  'brand',
  'philosophy',
  'supplement'
);

CREATE TYPE trust_grade AS ENUM ('A', 'B', 'C', 'D', 'E');

CREATE TYPE claim_status AS ENUM ('draft', 'published', 'archived');

-- ============================================
-- LIFESTYLE_CLAIMS
-- ============================================
CREATE TABLE lifestyle_claims (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    celebrity_id    UUID NOT NULL REFERENCES celebrities(id) ON DELETE RESTRICT,

    claim_type      claim_type NOT NULL,
    headline        VARCHAR(280) NOT NULL,
    body            TEXT,

    trust_grade     trust_grade NOT NULL DEFAULT 'D',
    primary_source_url TEXT,

    verified_by     VARCHAR(100),
    last_verified_at TIMESTAMPTZ DEFAULT NOW(),

    is_health_claim BOOLEAN NOT NULL DEFAULT FALSE,
    disclaimer_key  VARCHAR(100),

    base_diet_id    UUID REFERENCES base_diets(id) ON DELETE SET NULL,
    tags            TEXT[] NOT NULL DEFAULT '{}',

    status          claim_status NOT NULL DEFAULT 'draft',
    published_at    TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT trust_grade_published_gate CHECK (
      (status <> 'published') OR
      (trust_grade <> 'E' AND
       (trust_grade <> 'D' OR disclaimer_key IS NOT NULL))
    )
);

CREATE INDEX idx_lifestyle_claims_celeb ON lifestyle_claims(celebrity_id)
    WHERE is_active = TRUE AND status = 'published';
CREATE INDEX idx_lifestyle_claims_type ON lifestyle_claims(claim_type)
    WHERE is_active = TRUE AND status = 'published';
CREATE INDEX idx_lifestyle_claims_grade ON lifestyle_claims(trust_grade)
    WHERE is_active = TRUE;
CREATE INDEX idx_lifestyle_claims_published ON lifestyle_claims(published_at DESC NULLS LAST)
    WHERE status = 'published';
CREATE INDEX idx_lifestyle_claims_tags ON lifestyle_claims USING GIN (tags);

-- ============================================
-- CLAIM_SOURCES
-- ============================================
CREATE TABLE claim_sources (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    claim_id        UUID NOT NULL REFERENCES lifestyle_claims(id) ON DELETE CASCADE,

    source_type     VARCHAR(30) NOT NULL
                    CHECK (source_type IN (
                      'interview', 'social_post', 'podcast',
                      'book', 'article', 'press_release', 'other'
                    )),
    outlet          VARCHAR(200) NOT NULL,
    url             VARCHAR(2048),
    published_date  DATE,
    excerpt         VARCHAR(300),

    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claim_sources_claim ON claim_sources(claim_id);

-- 한 claim 당 primary source 최대 1 개
CREATE UNIQUE INDEX uq_claim_sources_primary
    ON claim_sources (claim_id) WHERE is_primary = TRUE;
