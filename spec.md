# CelebBase Wellness — Technical Specification v1.5.0

> **⚠ PIVOT-MOBILE-2026-05 BANNER (overrides spec body)**  
> Active client = `apps/mobile` (Expo / React Native, iOS + Android). `apps/web` SSR/pages/components 는 **FROZEN** (no active dev) — 단 `apps/web/src/app/api/**` (BFF) + `apps/web/src/lib/server/**` 은 **모바일의 active gateway** 로 살아 있다. Where this spec body assumes web-first (project structure §11, Tab UX in §7, etc.), **mobile-first reality wins**. 본문 재작성은 별도 task 로 분리 (`docs/SPEC-PIVOT-PLAN.md` 트리거 레지스트리 참조).  
> - Active roadmap: `docs/MOBILE-ROADMAP.md` (`docs/FE-ROADMAP.md` archived)  
> - **Mobile architecture (hybrid BFF)**: mobile → BFF (`createProtectedRoute` cookie + `Authorization: Bearer` fallback) → BE 서비스. **예외**: `/auth/refresh` 는 BFF 가 cookie-shaped (JSON 토큰 미반환) 이라 mobile 이 user-service 를 **직접 호출**. 그 외 모든 path 는 BFF 경유 (mobile-driven 신규 라우트 추가 OK — 예: `POST /api/subscriptions/sync`).  
> - Cognito SRP (Amplify) → id_token → user-service `/auth/signup` or `/auth/login` → internal access/refresh JWT (Plan v5 §Decisions).  
> - Frozen scope: `apps/web/src/app/(app|auth|marketing|slice)/**`, `apps/web/src/components/**`, `packages/ui-kit/**` 만 — BFF 와 server lib 는 active.  
> - Ownership: JUNWON (BE + active mobile-gateway BFF + infra), Dohyun (mobile FE)  

> **Status**: Draft  
> **Last Updated**: 2026-05-03 (v1.5.0)  
> **Changelog v1.5.0**: 셀럽 웰니스 피벗 (PIVOT-2026-05) — 첫 사용자 경험을 "출처 기반 lifestyle claim 카드 피드"로 전환, meal-plan-engine 은 보조 CTA. 신규 도메인 §3.5 LifestyleClaim (lifestyle_claims + claim_sources DDL, claim_type/trust_grade/claim_status 열거형, partial UNIQUE on is_primary, GIN index on tags), §3.4 Enum Glossary 3행 추가, §7.2 Tab 1 Discover → Wellness Claims Feed 재작성, §9.3 Security claim 도메인 7원칙 추가 (HTML sanitize, URL allowlist/SSRF 차단, soft delete propagation, draft 미노출, trust_grade published gate, is_health_claim 설정 주체, allowlist-only seed validator), §6A Trend Intelligence 에 §3.5 cross-ref  
> **Changelog v1.4.1**: Phase B 하네스 보강 — tasks.yaml 태스크 관리 + JSON Schema 검증, CI 10 Job 파이프라인 (validate-docs/schemas/compliance, contract-tests, security-scan, require-log-entry, generate-progress, notify-on-failure), 계약 테스트 (UUID/에러 포맷/FK 안전), 시크릿 스캔 규칙 보강 (Stripe/Slack 패턴 추가), evaluator-runtime.md MCP 직접 참조 → `EVALUATOR_BROWSER_TOOL` 환경변수 indirection  
> **Changelog v1.4**: 하네스 아키텍처 적용 — CLAUDE.md 60줄 인덱스로 축소, `.claude/rules/` 모듈형 규칙 9파일 분리 (path-scoped), Evaluator 런타임 검증 + Playwright MCP, DoD 3층 구조(Functional/Verification/Provenance) 도입, 프로젝트 구조에 `.claude/` 반영  
> **Changelog v1.3.1**: CASCADE→RESTRICT+삭제 정책 명시, WS ticket API 정식 등록, 전체 상태 전이 통합, diet_view_events 추가, MView SQL 수정(전일평균), DB CHECK 6필드, WS 경로 통일, PHI 암호화 매트릭스  
> **Changelog v1.3**: [버그] deleted_at·enum·snack·PHI 정책 수정. [신규] 비동기 상태 머신, 구독 할당량, 필드 유효성, 열거형 용어집, 매크로 우선순위, OCR 계약  
> **Changelog v1.2**: 영양 데이터 표준화, Two-Pass, PHI 최소화, 감사 로그, Materialized View, Instacart 배치  
> **Changelog v1.1**: 실시간 트렌드 비전, Trend Intelligence Service, Instacart 에러 핸들링 확장  
> **Architecture**: PGE (Planner-Generator-Evaluator) Harness  
> **Target Platform** (PIVOT-MOBILE-2026-05): iOS / Android (Expo / React Native) — primary. Web (Next.js, `apps/web`) SSR/pages 는 **FROZEN** — 단 `apps/web/src/app/api/**` (BFF) + `apps/web/src/lib/server/**` 은 모바일의 active gateway. See `docs/MOBILE-ROADMAP.md`.  
> **Active client roadmap**: `docs/MOBILE-ROADMAP.md`. `docs/FE-ROADMAP.md` is archived.

---

## 1. Product Overview

CelebBase Wellness는 셀러브리티 식단을 사용자의 생체 데이터에 맞춰 초개인화하고, 원재료를 원클릭 배송하는 프리미엄 B2C 웰니스 플랫폼이다.

**장기 비전**: 단순히 과거의 정적 식단을 제공하는 것을 넘어, 셀러브리티의 **실시간 라이프스타일 변화**(SNS 포스트, 인터뷰, 웰니스 트렌드)를 AI 소셜 리스닝으로 추적하여 **동적 베이스 레이어(Dynamic Base Layer)**로 진화시키는 것이 최종 목표이다. 이를 통해 사용자가 최신 웰니스 트렌드를 파악하기 위해 가장 먼저 접속하는 **트렌드 허브(Trend Hub)** 역할을 수행한다.

> **Phase 전략**: MVP(Phase 1)에서는 편집팀이 큐레이팅한 정적 식단 데이터로 핵심 가치를 검증한 뒤, Phase 2~3에서 실시간 트렌드 파이프라인을 점진적으로 도입한다.

### 1.1 Core Value Loop

> **PIVOT-2026-05**: 첫 사용자 경험은 "출처 기반 셀럽 lifestyle claim 카드 피드"다. 식단 처방(meal-plan-engine)은 carded claim 에서 inspired CTA 로 진입하는 보조 경로로 후단화한다.

```
[Curated Lifestyle Claim Feed]   ← Phase 1: 편집팀 큐레이션 + trust_grade A~D
        ↓                          (Phase 2+: Trend Intelligence 자동 후보 → §6A)
[Celebrity Profile / Claim Detail with Sources]
        ↓
[Inspired Meal Plan CTA]   ← claim → base_diet 연결 (선택적 진입)
        ↓
[User Bio-Profile Overlay]
        ↓
[AI Personalization Engine]
        ↓
[Optimized Meal Plan + Recipes]
        ↓
[Instacart One-Click Checkout]
        ↓
[Tracking & Feedback Loop] → (re-optimization)
```

### 1.2 Target Users

| Persona | Description | Key Need |
|---------|-------------|----------|
| Household CEO | 시간 부족한 고소득 가정 관리자 | 의사결정 피로 제거, 원클릭 실행 |
| Biohacker | 신체 최적화 추구 능동적 사용자 | 정밀한 매크로/마이크로 영양소 조절 |
| GLP-1 User | 오젬픽 등 체중감량약 사용자 | 근육 손실 방지 고단백 식단 |
| **Aspirational Millennial** *(PIVOT-2026-05 primary acquisition persona)* | 셀럽 라이프스타일 동경 2030세대. claim feed 의 사회적 증거 + 출처 투명성으로 신뢰 형성 후 inspired meal plan 으로 전환 | 사회적 증거 기반 자기관리 동기부여, 신뢰 가능한 출처 |

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Expo / RN    │  │   Next.js    │  │  Admin Dashboard │   │
│  │  (iOS/AOS)   │  │ (Web FROZEN) │  │    (Internal)    │   │
│  │  ★ primary   │  │  reference   │  │                  │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
└─────────┼─────────────────┼───────────────────┼─────────────┘
          │                 │                   │
          ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      API GATEWAY (Kong)                     │
│         Rate Limiting · Auth · Request Routing              │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Auth Svc    │  │  User Svc    │  │  Content Svc │
│  (Cognito)   │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
                          │                │
                          ▼                ▼
                  ┌──────────────┐  ┌──────────────┐
                  │  Meal Plan   │  │  Commerce    │
                  │  Engine Svc  │  │  Svc         │
                  │  (AI Core)   │  │  (Instacart) │
                  └──────────────┘  └──────────────┘
                          │
                          ▼
                  ┌──────────────┐  ┌──────────────────────┐
                  │  Analytics   │  │  Trend Intelligence  │ ← Phase 2+
                  │  Svc         │  │  Svc (Social Listen) │
                  └──────────────┘  └──────────────────────┘
```

### 2.2 Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Mobile (★ primary) | Expo SDK 52+ / React Native 0.76+ (New Arch) | 단일 코드베이스 → App Store + Play Store, EAS Build/Submit, shared-types/design-tokens 그대로 재사용 |
| Web (FROZEN) | Next.js 15 (App Router) — `apps/web` | PIVOT-MOBILE-2026-05 이후 비활성. 자산 보존 (admin·marketing 재활용 후보) |
| API Gateway | Kong Gateway | 인증 플러그인, rate limiting, 로깅 |
| Backend Services | Node.js 22 (Fastify) | 고성능 JSON 처리, TypeScript 공유 |
| AI Engine | Python 3.12 (FastAPI) | ML 생태계, 모델 서빙 최적화 |
| Database (Primary) | PostgreSQL 16 | JSONB, 관계형 쿼리, 풍부한 생태계 |
| Database (Cache) | Redis 7 (Cluster) | 세션, 식단 캐시, 실시간 데이터 |
| Search | Elasticsearch 8 | 셀럽/레시피 풀텍스트 검색 |
| Object Storage | AWS S3 | 이미지, 미디어 에셋 |
| CDN | CloudFront | 글로벌 에셋 배포 |
| Message Queue | AWS SQS / SNS | 비동기 작업 (식단 생성, 알림) |
| Monitoring | Datadog + Sentry | APM, 에러 트래킹, 로그 집중화 |
| CI/CD | GitHub Actions | PGE Harness 파이프라인 통합 |
| IaC | Terraform + AWS CDK | 인프라 코드 관리 |

### 2.3 PGE Harness Integration

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ PLANNER  │────▶│GENERATOR │────▶│EVALUATOR │
│          │     │          │     │          │
│ spec.md  │     │ Code Gen │     │ Test &   │
│ CLAUDE.md│     │ + Build  │     │ Validate │
└──────────┘     └──────────┘     └──────────┘
      │                                │
      └──────── Feedback Loop ─────────┘
```

- **Planner** (본 문서): 사양 정의, 태스크 분해, 우선순위 결정
- **Generator**: spec 기반 코드 생성, 컴포넌트 구현
- **Evaluator**: 자동 테스트, 코드 리뷰, 성능 벤치마크

---

## 3. Data Models

### 3.1 Core Entities (PostgreSQL Schema)

```sql
-- ============================================
-- UUID v7 함수 정의 (시간순 정렬 가능한 UUID)
-- PostgreSQL 17+ 내장 또는 pg_uuidv7 확장 사용
-- 앱 레이어: TypeScript → uuid v7 (npm: uuidv7), Python → uuid7 (pip: uuid7)
-- ============================================
CREATE EXTENSION IF NOT EXISTS pg_uuidv7;
-- uuid_generate_v7() 함수를 pg_uuidv7 확장이 제공

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    cognito_sub     VARCHAR(128) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    display_name    VARCHAR(100) NOT NULL,
    avatar_url      TEXT,
    subscription_tier VARCHAR(20) DEFAULT 'free'
                    CHECK (subscription_tier IN ('free', 'premium', 'elite')),
    locale          VARCHAR(10) DEFAULT 'en-US',
    timezone        VARCHAR(50) DEFAULT 'America/Los_Angeles',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ  -- soft delete
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_cognito ON users(cognito_sub);

-- ============================================
-- BIO PROFILE (Onboarding Survey Data)
-- ============================================

CREATE TABLE bio_profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    /*
      ON DELETE RESTRICT 이유: soft delete 시 자식 데이터 보존.
      계정 삭제 흐름 (CLAUDE.md § 2.2 Right to Deletion 참조):
        1. users.deleted_at 세팅 (soft delete)
        2. bio_profiles: ePHI 필드 암호화 키 폐기 → 30일 후 hard delete
        3. meal_plans: deleted_at 세팅 (soft delete, 통계 보존)
        4. daily_logs: 30일 후 hard delete
        5. instacart_orders: user_id를 익명화(NULL) 처리, 주문 기록 보존 (재무 감사용)
        6. subscriptions: status='expired' 처리, Stripe 연동 해제
        7. 30일 후 배치 작업이 users 행 hard delete → RESTRICT 해제됨
    */
    
    -- Physical Metrics
    birth_year      INTEGER CHECK (birth_year BETWEEN 1920 AND 2013),
    sex             VARCHAR(20),
    height_cm       DECIMAL(5,1) CHECK (height_cm BETWEEN 100.0 AND 250.0),
    weight_kg       DECIMAL(5,1) CHECK (weight_kg BETWEEN 30.0 AND 300.0),
    waist_cm        DECIMAL(5,1) CHECK (waist_cm BETWEEN 40.0 AND 200.0),
    body_fat_pct    DECIMAL(4,1) CHECK (body_fat_pct BETWEEN 3.0 AND 60.0),
    
    -- Activity & Lifestyle
    activity_level  VARCHAR(20) 
                    CHECK (activity_level IN ('sedentary','light','moderate','active','very_active')),
    sleep_hours_avg DECIMAL(3,1) CHECK (sleep_hours_avg BETWEEN 2.0 AND 16.0),
    stress_level    VARCHAR(10) CHECK (stress_level IN ('low','moderate','high')),
    
    -- Health Data
    allergies       TEXT[] DEFAULT '{}',          -- e.g. {'gluten','dairy','shellfish'}
    intolerances    TEXT[] DEFAULT '{}',
    medical_conditions TEXT[] DEFAULT '{}',
    medications     TEXT[] DEFAULT '{}',
    
    -- Biomarkers (optional, from lab results)
    biomarkers      JSONB DEFAULT '{}',
    /*
      biomarkers schema:
      {
        "fasting_glucose_mg_dl": 92,
        "hba1c_pct": 5.4,
        "total_cholesterol_mg_dl": 185,
        "ldl_mg_dl": 110,
        "hdl_mg_dl": 55,
        "triglycerides_mg_dl": 120,
        "crp_mg_l": 0.8,
        "vitamin_d_ng_ml": 45,
        "ferritin_ng_ml": 80,
        "testosterone_ng_dl": null,
        "last_lab_date": "2026-01-15"
      }
    */
    
    -- Wellness Goals
    primary_goal    VARCHAR(30)
                    CHECK (primary_goal IN (
                      'weight_loss','muscle_gain','maintenance',
                      'longevity','energy','gut_health','skin_health',
                      'athletic_performance','glp1_support'
                    )),
    secondary_goals TEXT[] DEFAULT '{}',
    
    -- Dietary Preferences
    diet_type       VARCHAR(20) 
                    CHECK (diet_type IN ('omnivore','pescatarian','vegetarian','vegan','keto','paleo')),
    cuisine_preferences TEXT[] DEFAULT '{}',
    disliked_ingredients TEXT[] DEFAULT '{}',
    
    -- Calculated Fields (by AI Engine)
    bmr_kcal        INTEGER,          -- Basal Metabolic Rate
    tdee_kcal       INTEGER,          -- Total Daily Energy Expenditure
    target_kcal     INTEGER,          -- Daily calorie target
    macro_targets   JSONB DEFAULT '{}',
    /*
      macro_targets schema:
      {
        "protein_g": 150,
        "carbs_g": 200,
        "fat_g": 65,
        "fiber_g": 30
      }
    */
    
    version         INTEGER DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_bio_profiles_user ON bio_profiles(user_id);

-- ============================================
-- CELEBRITIES
-- ============================================

CREATE TABLE celebrities (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    slug            VARCHAR(100) UNIQUE NOT NULL,   -- e.g. 'ariana-grande'
    display_name    VARCHAR(150) NOT NULL,
    short_bio       TEXT,
    avatar_url      TEXT NOT NULL,
    cover_image_url TEXT,
    
    category        VARCHAR(20) NOT NULL
                    CHECK (category IN ('diet','protein','vegetarian','general')),
    tags            TEXT[] DEFAULT '{}',             -- e.g. {'vegan','plant-based','singer'}
    
    -- Metadata
    is_featured     BOOLEAN DEFAULT FALSE,
    sort_order      INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_celebrities_category ON celebrities(category) WHERE is_active = TRUE;
CREATE INDEX idx_celebrities_featured ON celebrities(is_featured, sort_order) WHERE is_active = TRUE;

-- ============================================
-- BASE DIETS (Celebrity's known diet framework)
-- ============================================

CREATE TABLE base_diets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    celebrity_id    UUID NOT NULL REFERENCES celebrities(id),
    
    name            VARCHAR(200) NOT NULL,          -- e.g. 'Ariana Grande Plant-Based Reset'
    description     TEXT,
    philosophy      TEXT,                           -- dietary philosophy summary
    
    -- Nutritional Framework
    diet_type       VARCHAR(20) NOT NULL,
    avg_daily_kcal  INTEGER,
    macro_ratio     JSONB NOT NULL,
    /*
      macro_ratio schema:
      {
        "protein_pct": 20,
        "carbs_pct": 55,
        "fat_pct": 25
      }
    */
    
    -- Included/Excluded Food Groups
    included_foods  TEXT[] DEFAULT '{}',
    excluded_foods  TEXT[] DEFAULT '{}',
    key_supplements TEXT[] DEFAULT '{}',
    
    -- Source & Credibility
    source_refs     JSONB DEFAULT '[]',
    /*
      source_refs schema:
      [
        {
          "type": "interview",
          "outlet": "Vogue",
          "date": "2025-03-01",
          "url": "https://..."
        }
      ]
    */
    verified_by     VARCHAR(100),                    -- e.g. 'Dr. Jane Smith, RD'
    
    -- Data Freshness (Phase 2+: Trend Intelligence 연동)
    last_verified_at TIMESTAMPTZ DEFAULT NOW(),      -- 편집팀이 마지막으로 확인한 시점
    version         INTEGER DEFAULT 1,               -- 식단 버전 (변경 이력 추적)
    
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_base_diets_celeb ON base_diets(celebrity_id) WHERE is_active = TRUE;

-- ============================================
-- RECIPES (tied to base diets)
-- ============================================

CREATE TABLE recipes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    base_diet_id    UUID NOT NULL REFERENCES base_diets(id),
    
    title           VARCHAR(200) NOT NULL,
    slug            VARCHAR(200) NOT NULL,
    description     TEXT,
    meal_type       VARCHAR(20) NOT NULL
                    CHECK (meal_type IN ('breakfast','lunch','dinner','snack','smoothie')),
    
    prep_time_min   INTEGER,
    cook_time_min   INTEGER,
    servings        INTEGER DEFAULT 1,
    difficulty      VARCHAR(10) CHECK (difficulty IN ('easy','medium','hard')),
    
    -- Nutrition per serving
    nutrition       JSONB NOT NULL,
    nutrition_source    VARCHAR(30) DEFAULT 'manual_legacy'
                    CHECK (nutrition_source IN ('derived_from_ingredients','manual_verified','manual_legacy')),
    /*
      nutrition schema:
      {
        "calories": 420,
        "protein_g": 25,
        "carbs_g": 48,
        "fat_g": 15,
        "fiber_g": 8,
        "sugar_g": 12,
        "sodium_mg": 380,
        "micronutrients": {
          "vitamin_d_iu": 200,
          "iron_mg": 4.5,
          "calcium_mg": 150
        }
      }
    */
    
    instructions    JSONB NOT NULL,                  -- ordered step array
    /*
      instructions schema:
      [
        { "step": 1, "text": "Preheat oven to 375°F.", "duration_min": null },
        { "step": 2, "text": "Mix dry ingredients.", "duration_min": 5 }
      ]
    */
    
    tips            TEXT,
    image_url       TEXT,
    video_url       TEXT,
    
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recipes_diet ON recipes(base_diet_id) WHERE is_active = TRUE;
CREATE INDEX idx_recipes_meal ON recipes(meal_type);

-- ============================================
-- INGREDIENTS (master list)
-- ============================================

CREATE TABLE ingredients (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    name                VARCHAR(200) NOT NULL,
    name_normalized     VARCHAR(200) NOT NULL,      -- lowercase, trimmed
    category            VARCHAR(50),                -- 'produce', 'protein', 'dairy', etc.
    
    -- Instacart mapping
    instacart_product_id VARCHAR(100),
    instacart_upc       VARCHAR(50),
    default_unit        VARCHAR(20),                -- 'g','oz','cup','piece','tbsp'
    
    -- Common allergens this ingredient contains
    allergens           TEXT[] DEFAULT '{}',
    
    -- Nutritional data per 100g
    nutrition_per_100g  JSONB DEFAULT '{}',
    fdc_id              INTEGER,
    nutrition_source    VARCHAR(30) CHECK (nutrition_source IN ('usda_fdc','nih_ods','manual_verified')),
    nutrition_source_version VARCHAR(50),
    nutrition_updated_at TIMESTAMPTZ,
    portion_conversions JSONB DEFAULT '{}',
    
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ingredients_normalized ON ingredients(name_normalized);

-- ============================================
-- RECIPE ↔ INGREDIENT (join table)
-- ============================================

CREATE TABLE recipe_ingredients (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
    
    quantity        DECIMAL(8,2) NOT NULL,
    unit            VARCHAR(20) NOT NULL,
    preparation     VARCHAR(100),                   -- 'diced', 'minced', 'melted'
    is_optional     BOOLEAN DEFAULT FALSE,
    sort_order      INTEGER DEFAULT 0,
    
    UNIQUE(recipe_id, ingredient_id)
);

-- ============================================
-- PERSONALIZED MEAL PLANS
-- ============================================

CREATE TABLE meal_plans (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         UUID NOT NULL REFERENCES users(id),
    base_diet_id    UUID NOT NULL REFERENCES base_diets(id),
    
    name            VARCHAR(200),
    status          VARCHAR(20) NOT NULL
                    CHECK (status IN ('queued','generating','draft','active','completed','failed','expired','archived')),
    /*
      status 생성 경로별 초기값 (DEFAULT 없음 — 애플리케이션에서 명시적 설정):
      - POST /meal-plans/generate → 'queued' (비동기 AI 생성 플로우)
      - PATCH /meal-plans/:id     → 'draft' (사용자 수동 편집 초안, Phase 2)
    */
    
    -- Personalization applied
    adjustments     JSONB DEFAULT '{}',
    /*
      adjustments schema:
      {
        "calorie_adjustment_pct": -15,
        "protein_boost_g": 30,
        "removed_allergens": ["dairy","gluten"],
        "substitutions": [
          {
            "original_ingredient_id": "uuid",
            "substitute_ingredient_id": "uuid",
            "reason": "dairy_allergy"
          }
        ],
        "added_supplements": ["vitamin_b12","omega3"]
      }
    */
    
    -- Plan period
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    
    -- Daily breakdown
    daily_plans     JSONB NOT NULL,
    /*
      daily_plans schema:
      [
        {
          "day": 1,
          "date": "2026-04-03",
          "meals": [
            {
              "meal_type": "breakfast",
              "recipe_id": "uuid",
              "adjusted_nutrition": { ... },
              "adjusted_servings": 1.2
            }
          ],
          "daily_totals": {
            "calories": 1850,
            "protein_g": 140,
            "carbs_g": 180,
            "fat_g": 62
          }
        }
      ]
    */
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ              -- soft delete
);

CREATE INDEX idx_meal_plans_user ON meal_plans(user_id, status) WHERE deleted_at IS NULL;

-- ============================================
-- INSTACART ORDERS
-- ============================================

CREATE TABLE instacart_orders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id             UUID NOT NULL REFERENCES users(id),
    meal_plan_id        UUID NOT NULL REFERENCES meal_plans(id),
    
    instacart_order_id  VARCHAR(100),
    status              VARCHAR(20) DEFAULT 'pending'
                        CHECK (status IN ('pending','submitted','confirmed','delivered','cancelled')),
    
    items               JSONB NOT NULL,
    /*
      items schema:
      [
        {
          "ingredient_id": "uuid",
          "instacart_product_id": "prod_123",
          "name": "Organic Avocado",
          "quantity": 3,
          "unit": "piece",
          "estimated_price_usd": 5.97
        }
      ]
    */
    
    subtotal_usd        DECIMAL(10,2),
    delivery_fee_usd    DECIMAL(6,2),
    total_usd           DECIMAL(10,2),
    
    delivery_address_id UUID,
    scheduled_delivery  TIMESTAMPTZ,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON instacart_orders(user_id, created_at DESC);

-- ============================================
-- SUBSCRIPTIONS
-- ============================================

CREATE TABLE subscriptions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id             UUID NOT NULL REFERENCES users(id),
    
    tier                VARCHAR(20) NOT NULL
                        CHECK (tier IN ('premium','elite')),
    stripe_subscription_id VARCHAR(100),
    stripe_customer_id  VARCHAR(100),
    
    status              VARCHAR(20) DEFAULT 'active'
                        CHECK (status IN ('active','past_due','cancelled','expired')),
    
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    
    -- Admin override for per-user quota adjustment (§4.3)
    quota_override      JSONB DEFAULT '{}',
    /*
      quota_override schema (빈 객체 = 기본 티어 한도 적용):
      {
        "max_plans_per_month": 10,    -- 기본값 오버라이드
        "max_diet_views_per_month": null  -- null = 무제한
      }
    */
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COMMERCE WEBHOOK IDEMPOTENCY (PIVOT-MOBILE-2026-05)
-- ============================================

-- Migration 0008 (initial — Stripe-only) + 0016 (IMPL-MOBILE-PAY-001a-1 expand: provider/event_id NULL columns)
-- + 0017 (IMPL-MOBILE-PAY-001a-2 backfill + CHECK + partial UNIQUE).
CREATE TABLE processed_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    stripe_event_id     VARCHAR(100) NOT NULL,                  -- Stripe path (legacy, web 잔존)
    event_type          VARCHAR(100) NOT NULL,
    processed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload_hash        CHAR(64) NOT NULL,
    result              VARCHAR(20) NOT NULL
                        CHECK (result IN ('applied','skipped','error')),
    error_message       TEXT,

    -- IMPL-MOBILE-PAY-001a-1 expand phase: dual-provider columns (NULL allowed for legacy rows)
    provider            TEXT,                                   -- 'stripe' | 'revenuecat' | NULL (legacy rows tolerated)
    event_id            TEXT,                                   -- provider-native event id (Stripe `evt_...` 또는 RevenueCat event uuid)

    CONSTRAINT uq_processed_events_stripe_id UNIQUE (stripe_event_id),

    -- IMPL-MOBILE-PAY-001a-2: NULL-tolerant whitelist (matches partial UNIQUE design)
    CONSTRAINT processed_events_provider_check
                        CHECK (provider IS NULL OR provider IN ('stripe','revenuecat'))
);

CREATE INDEX idx_processed_events_processed_at ON processed_events (processed_at DESC);
CREATE INDEX idx_processed_events_stripe_event_id ON processed_events (stripe_event_id);

-- IMPL-MOBILE-PAY-001a-2: partial UNIQUE — replaces stripe_event_id UNIQUE 의 idempotency 역할 (RevenueCat 전환 후).
-- WHERE provider IS NOT NULL → legacy NULL rows 는 인덱스에서 제외 (CONCURRENTLY 빌드, online).
-- 001a-2 migration 은 이 인덱스 생성 직전 UPDATE 로 NULL rows 를 (provider='stripe', event_id=stripe_event_id) backfill.
CREATE UNIQUE INDEX CONCURRENTLY uq_processed_events_provider_event_id
    ON processed_events (provider, event_id)
    WHERE provider IS NOT NULL;

-- ============================================
-- USER TRACKING / FEEDBACK
-- ============================================

CREATE TABLE daily_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         UUID NOT NULL REFERENCES users(id),
    log_date        DATE NOT NULL,
    
    meals_completed JSONB DEFAULT '{}',
    /*
      { "breakfast": true, "lunch": true, "dinner": false, "snack": true }
    */
    
    weight_kg       DECIMAL(5,1),
    energy_level    INTEGER CHECK (energy_level BETWEEN 1 AND 5),
    mood            INTEGER CHECK (mood BETWEEN 1 AND 5),
    sleep_quality   INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
    notes           TEXT,
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, log_date)
);

-- ============================================
-- DIET VIEW EVENTS (구독 할당량 추적, §4.3/§8)
-- ============================================

CREATE TABLE diet_view_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         UUID NOT NULL REFERENCES users(id),
    base_diet_id    UUID NOT NULL REFERENCES base_diets(id),
    
    viewed_at       TIMESTAMPTZ DEFAULT NOW()
    /*
      카운팅 규칙 (§4.3 참조):
      - Free 유저: GET /base-diets/:id 성공 응답 시 1건 기록
      - 동일 base_diet_id 재조회는 24시간 내 중복 차감하지 않음 (UNIQUE 제약 대신 앱 로직)
      - 월간 카운트: WHERE viewed_at >= 해당월 1일 00:00 UTC AND viewed_at < 다음월 1일 00:00 UTC
      - Premium/Elite: 무제한이므로 기록하지 않음 (write 절약)
    */
);

CREATE INDEX idx_diet_views_user_month ON diet_view_events(user_id, viewed_at DESC);

-- ============================================
-- PHI ACCESS AUDIT LOG (HIPAA 감사 추적)
-- ============================================

CREATE TABLE phi_access_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         UUID NOT NULL,                  -- 데이터 주체 (FK 의도적 미설정 — 삭제 후에도 로그 보존)
    accessed_by     VARCHAR(100) NOT NULL,          -- 'meal-plan-engine-v1.2.3', 'admin:jane@celebbase.com'
    action          VARCHAR(20) NOT NULL
                    CHECK (action IN ('READ','WRITE','DELETE')),
    phi_fields      TEXT[] NOT NULL,                -- ['biomarkers.fasting_glucose','medications']
    purpose         TEXT NOT NULL,                  -- 'generate_meal_plan', 'glp1_adjustment'
    request_id      VARCHAR(100),                   -- correlation ID
    ip_address      INET,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    retention_until TIMESTAMPTZ DEFAULT NOW() + INTERVAL '6 years'  -- HIPAA 6년 보관
);

CREATE INDEX idx_phi_logs_user ON phi_access_logs(user_id, created_at DESC);
CREATE INDEX idx_phi_logs_retention ON phi_access_logs(retention_until);

-- ============================================
-- MATERIALIZED VIEW: 월간 식단 통계 (성능 최적화)
-- ============================================

CREATE MATERIALIZED VIEW IF NOT EXISTS meal_plan_monthly_stats AS
SELECT 
    mp.user_id,
    DATE_TRUNC('month', mp.start_date) AS month,
    COUNT(DISTINCT mp.id) AS plans_generated,
    AVG((day_elem->'daily_totals'->>'calories')::int) AS avg_daily_calories,
    COUNT(DISTINCT mp.id) FILTER (WHERE mp.status = 'completed') AS completed_count
FROM meal_plans mp,
     jsonb_array_elements(mp.daily_plans) AS day_elem
WHERE mp.deleted_at IS NULL
GROUP BY mp.user_id, DATE_TRUNC('month', mp.start_date);

CREATE UNIQUE INDEX idx_mps_user_month ON meal_plan_monthly_stats(user_id, month);
-- 갱신: REFRESH MATERIALIZED VIEW CONCURRENTLY meal_plan_monthly_stats; (15분 cron)
```

### 3.2 Entity Relationship Summary

```
users 1──1 bio_profiles
users 1──N meal_plans
users 1──N instacart_orders
users 1──N daily_logs
users 1──N diet_view_events
users 1──1 subscriptions
users 1──N phi_access_logs (audit trail, no FK — survives user deletion)

celebrities 1──N base_diets
base_diets 1──N recipes
base_diets 1──N diet_view_events
recipes N──N ingredients (via recipe_ingredients)

meal_plans N──1 base_diets
meal_plans 1──N instacart_orders
```

### 3.3 Bio-Profile Field Validation Constraints

API 입력 검증(Zod/Pydantic)에서 반드시 적용할 허용 범위. 범위 밖 값은 `400 VALIDATION_ERROR`로 거부한다.

| Field | Type | Min | Max | Required | Notes |
|-------|------|-----|-----|----------|-------|
| `birth_year` | int | 1920 | current_year - 13 | Yes | 13세 미만 사용 불가 (COPPA) |
| `height_cm` | decimal | 100.0 | 250.0 | Yes | |
| `weight_kg` | decimal | 30.0 | 300.0 | Yes | |
| `waist_cm` | decimal | 40.0 | 200.0 | No | |
| `body_fat_pct` | decimal | 3.0 | 60.0 | No | |
| `sleep_hours_avg` | decimal | 2.0 | 16.0 | No | |
| `activity_level` | enum | — | — | Yes | `sedentary\|light\|moderate\|active\|very_active` |
| `primary_goal` | enum | — | — | Yes | 아래 표준 열거형 참조 |
| `allergies[]` | string[] | 0 items | 20 items | No | 각 항목 max 50자 |
| `biomarkers.fasting_glucose_mg_dl` | int | 40 | 500 | No | |
| `biomarkers.hba1c_pct` | decimal | 3.0 | 15.0 | No | |

### 3.4 Standard Enum Glossary

모든 테이블, API 검증기, AI 엔진 파이프라인에서 동일한 리터럴을 사용한다. 약어 사용 금지.

| Domain | Enum Name | Values |
|--------|-----------|--------|
| Activity Level | `activity_level` | `sedentary`, `light`, `moderate`, `active`, `very_active` |
| Primary Goal | `primary_goal` | `weight_loss`, `muscle_gain`, `maintenance`, `longevity`, `energy`, `gut_health`, `skin_health`, `athletic_performance`, `glp1_support` |
| Diet Type | `diet_type` | `omnivore`, `pescatarian`, `vegetarian`, `vegan`, `keto`, `paleo` |
| Meal Type | `meal_type` | `breakfast`, `lunch`, `dinner`, `snack`, `smoothie` |
| Celebrity Category | `category` | `diet`, `protein`, `vegetarian`, `general` |
| Subscription Tier | `subscription_tier` | `free`, `premium`, `elite` |
| Meal Plan Status | `meal_plan_status` | `queued`, `generating`, `draft`, `active`, `completed`, `failed`, `expired`, `archived` |
| Stress Level | `stress_level` | `low`, `moderate`, `high` |
| Claim Type *(PIVOT-2026-05)* | `claim_type` | `food`, `workout`, `sleep`, `beauty`, `brand`, `philosophy`, `supplement` |
| Trust Grade *(PIVOT-2026-05)* | `trust_grade` | `A`, `B`, `C`, `D`, `E` (정의: §3.5.2) |
| Claim Status *(PIVOT-2026-05)* | `claim_status` | `draft`, `published`, `archived` |

> **규칙**: 새로운 열거형 값을 추가할 때는 이 표를 먼저 업데이트하고, DB CHECK constraint + Zod enum + Pydantic Literal을 동시에 수정한다.

### 3.5 LifestyleClaim Domain Models *(PIVOT-2026-05)*

> 셀럽의 라이프스타일 발언/루틴/선호를 출처와 신뢰등급(trust_grade)과 함께 카드 단위로 저장하는 도메인. 첫 사용자 경험인 "Wellness Claims Feed" (§7.2 Tab 1) 의 데이터 소스이며, base_diets 와 1:N 으로 느슨하게 연결된다 (claim → inspired meal plan 진입점).

> **셀럽 선정 정책 (genre-agnostic)**: 분야·장르·국적 무관, 영향력 + 검증 가능한 wellness 발언 ≥ 5건 두 축으로만 판단. 명시적 Tier 분류는 운영 도구로만 사용하고 사용자 노출 금지. claim 양은 셀럽별 비대칭 허용 (5~30/celeb). 상세: `.claude/rules/domain/content.md` "Genre-Agnostic Selection Policy".

#### 3.5.1 `claim_type` Enum

| Value | 의미 | 예시 |
|-------|------|------|
| `food` | 식단·음료·식품 선호 | "켄달 제너의 셀러리 주스 모닝 루틴" |
| `workout` | 운동·피트니스 루틴 | "헤일리 비버의 필라테스 주 3회" |
| `sleep` | 수면 루틴 | "벨라 하디드의 8시간 수면 우선시" |
| `beauty` | 스킨케어·헤어케어 루틴 | "젠데이아의 SPF 50 데일리" |
| `brand` | 사용·언급한 브랜드 | "셀레나 고메즈 - Rare Beauty" |
| `philosophy` | 가치관·라이프스타일 철학 | "기네스 펠트로의 클린 이팅 철학" |
| `supplement` | 영양제·보충제 (food 와 분리) | "마그네슘 글리시네이트" |

#### 3.5.2 `trust_grade` 정의 + Published Gate 정책

| Grade | 의미 | Published 가능 | Disclaimer |
|-------|------|---------------|-----------|
| **A** | 본인 공식 SNS·인터뷰 영상·1차 발언 직접 인용 | ✅ | 선택 |
| **B** | 검증된 매체 직접 인터뷰·방송 (Vogue, ELLE, People 등) | ✅ | 선택 |
| **C** | 브랜드 협업·보도자료·공식 캠페인 | ✅ | 권장 |
| **D** | 2차 보도·간접 추정 | ✅ (제한) | **`disclaimer_key NOT NULL` 필수** |
| **E** | 출처 불명·팬 추정 | ❌ | 내부 후보로만 보존 |

DB CHECK constraint `trust_grade_published_gate` 가 위 정책을 강제한다 (§3.5.3 DDL 참조). 운영자/admin 라우트는 D 등급 publish 시 disclaimer 선택을 강제한다.

#### 3.5.3 DDL

```sql
-- ============================================
-- Enums
-- ============================================
CREATE TYPE claim_type AS ENUM (
  'food', 'workout', 'sleep', 'beauty', 'brand', 'philosophy', 'supplement'
);

CREATE TYPE trust_grade AS ENUM ('A', 'B', 'C', 'D', 'E');

CREATE TYPE claim_status AS ENUM ('draft', 'published', 'archived');

-- ============================================
-- LIFESTYLE_CLAIMS — 셀럽 라이프스타일 발언/루틴 카드
-- ============================================
CREATE TABLE lifestyle_claims (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    celebrity_id    UUID NOT NULL REFERENCES celebrities(id) ON DELETE RESTRICT,

    claim_type      claim_type NOT NULL,
    headline        VARCHAR(280) NOT NULL,   -- plain text only (HTML 금지, §9.3 #1)
    body            TEXT,                    -- plain text only (Zod max 10000)

    trust_grade     trust_grade NOT NULL DEFAULT 'D',
    primary_source_url TEXT,                 -- Zod에서 url() + max(2048) 강제

    verified_by     VARCHAR(100),
    last_verified_at TIMESTAMPTZ DEFAULT NOW(),

    is_health_claim BOOLEAN NOT NULL DEFAULT FALSE,  -- 설정 주체 §9.3 #6
    disclaimer_key  VARCHAR(100),                    -- D 등급 published 시 NOT NULL 필수

    base_diet_id    UUID REFERENCES base_diets(id) ON DELETE SET NULL,
    tags            TEXT[] NOT NULL DEFAULT '{}',

    status          claim_status NOT NULL DEFAULT 'draft',
    published_at    TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Trust gate: E는 published 금지, D는 disclaimer_key 필수
    CONSTRAINT trust_grade_published_gate CHECK (
      (status != 'published') OR
      (trust_grade != 'E' AND
       (trust_grade != 'D' OR disclaimer_key IS NOT NULL))
    )
);

-- 서빙 쿼리는 always status='published' AND is_active=TRUE 조건 필수 (§9.3 #4)
CREATE INDEX idx_lifestyle_claims_celeb ON lifestyle_claims(celebrity_id)
    WHERE is_active = TRUE AND status = 'published';
CREATE INDEX idx_lifestyle_claims_type ON lifestyle_claims(claim_type)
    WHERE is_active = TRUE AND status = 'published';
CREATE INDEX idx_lifestyle_claims_grade ON lifestyle_claims(trust_grade)
    WHERE is_active = TRUE;
CREATE INDEX idx_lifestyle_claims_published ON lifestyle_claims(published_at DESC NULLS LAST)
    WHERE status = 'published';
-- tags 검색용 GIN
CREATE INDEX idx_lifestyle_claims_tags ON lifestyle_claims USING GIN (tags);

-- ============================================
-- CLAIM_SOURCES — 한 claim 의 출처 N개 (1차 + 보조)
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
    url             VARCHAR(2048),           -- 길이 제약 명시
    published_date  DATE,
    excerpt         VARCHAR(300),            -- fair-use 인용 (plain text only)

    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claim_sources_claim ON claim_sources(claim_id);

-- 핵심: 한 claim 에 primary source 는 최대 1개만 허용 (FE 렌더 결정성)
CREATE UNIQUE INDEX uq_claim_sources_primary
    ON claim_sources (claim_id) WHERE is_primary = TRUE;
```

#### 3.5.4 보안·법적 원칙 cross-reference

이 도메인의 안전/법적 표현 원칙은 §9.3 Security 의 "claim 도메인 7원칙" 절에 단일 출처(SoT)로 정리한다. 변경 시 §9.3 을 먼저 갱신하고 DDL/Zod/repository 가 이를 따른다.

---

## 4. API Design

### 4.1 API Conventions

- **Base URL**: `https://api.celebbase.com/v1`
- **Auth**: Bearer Token (AWS Cognito JWT)
- **Format**: JSON (application/json)
- **Pagination**: Cursor-based (`?cursor=xxx&limit=20`)
- **Error Format**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [{ "field": "weight_kg", "issue": "must be positive" }],
    "requestId": "req_abc123"
  }
}
```
- **HTTP Status Codes**: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 422 Unprocessable Entity, 429 Rate Limited, 500 Internal Error

### 4.2 Endpoint Catalog

#### Auth & User

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/auth/signup` | 소셜/이메일 가입. Cognito id_token 의 `aud` 는 `[bff_client_id, mobile_client_id]` 배열 ANY-match 검증 (PIVOT-MOBILE-2026-05, IMPL-MOBILE-AUTH-001 / PR #36). **Mobile 진입점**: BFF `POST /api/auth/mobile/signup` (Set-Cookie 미발급, JSON 토큰 직반환 — IMPL-MOBILE-AUTH-002a). Web 진입점: BFF `POST /api/auth/signup` (cookie-shaped). | No |
| POST | `/auth/login` | 로그인 (Cognito SRP via Amplify on mobile / cookie-shaped on web BFF). 동일 audience 배열 검증. **Mobile 진입점**: BFF `POST /api/auth/mobile/login` (Set-Cookie 미발급, JSON 토큰 직반환 — IMPL-MOBILE-AUTH-002a). | No |
| POST | `/auth/refresh` | 토큰 리프레시. 본 라우트는 BFF 가 cookie-shaped 라 mobile 이 user-service 를 **직접 호출** (BFF 미경유 예외 — banner 참조). 401 응답 envelope `error.code` 는 5종 enum 으로 분기 — §9.3 Refresh Token Reason Codes 참조 (PIVOT-MOBILE-2026-05, IMPL-MOBILE-AUTH-003) | Refresh |
| POST | `/ws/ticket` | WebSocket 1회용 연결 티켓 발급 (TTL 30초) | JWT |
| GET | `/users/me` | 내 프로필 조회 | JWT |
| PATCH | `/users/me` | 프로필 수정 | JWT |
| DELETE | `/users/me` | 계정 삭제 (soft delete → 30일 후 hard delete 배치) | JWT |

**POST `/ws/ticket` 계약:**
```json
// Request: (body 없음, Authorization: Bearer {JWT})

// Response 200:
{ "ticket": "ws_aBcDeFgH123", "expires_in_sec": 30 }

// Response 429: 티켓 발급 rate limit (유저당 10회/분)
// Response 401: JWT 만료/무효
```
> 티켓은 1회 사용 즉시 폐기. 미사용 시 30초 후 자동 만료. Redis에 저장 (`ws:ticket:{ticket}`, TTL 30s).

#### Bio Profile (Onboarding)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/users/me/bio-profile` | 설문 결과 저장 | JWT |
| GET | `/users/me/bio-profile` | 바이오 프로필 조회 | JWT |
| PATCH | `/users/me/bio-profile` | 바이오 프로필 업데이트 | JWT |
| POST | `/users/me/bio-profile/recalculate` | TDEE/매크로 재계산 트리거 | JWT |

#### Celebrities & Base Diets

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/celebrities` | 셀럽 목록 (필터: category, featured) | JWT |
| GET | `/celebrities/:slug` | 셀럽 상세 | JWT |
| GET | `/celebrities/:slug/diets` | 셀럽의 식단 목록 | JWT |
| GET | `/base-diets/:id` | 베이스 식단 상세 | JWT |
| GET | `/base-diets/:id/recipes` | 식단 내 레시피 목록 | JWT |

#### Meal Plan Engine (AI Core)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/meal-plans/generate` | AI 개인화 식단 생성 | JWT |
| GET | `/meal-plans` | 내 식단 목록 | JWT |
| GET | `/meal-plans/:id` | 식단 상세 (일별 계획 포함) | JWT |
| PATCH | `/meal-plans/:id` | 식단 수정 (수동 조정) | JWT |
| POST | `/meal-plans/:id/regenerate` | 재생성 (조건 변경 반영) | JWT |
| DELETE | `/meal-plans/:id` | 식단 보관 처리 | JWT |

**POST `/meal-plans/generate` Request Body:**
```json
{
  "base_diet_id": "uuid",
  "duration_days": 7,
  "preferences": {
    "exclude_recipes": ["uuid"],
    "max_prep_time_min": 30,
    "budget_level": "moderate",
    "meal_types": ["breakfast", "lunch", "dinner", "snack"]
  }
}
```

**POST `/meal-plans/generate` Response:**
```json
{
  "id": "uuid",
  "status": "queued",
  "estimated_completion_sec": 15,
  "poll_url": "/v1/meal-plans/{id}",
  "ws_channel": "/ws/meal-plans/{id}/status"
}
```

**비동기 생성 — 전체 상태 전이 다이어그램:**
```
                              ┌─────────────────────────────┐
                              │    Meal Plan Lifecycle       │
                              └─────────────────────────────┘

  [POST /generate]           [AI Engine]                    [User Action]
        │                        │                              │
        ▼                        │                              │
     queued ──── (5분 TTL) ───▶ expired ──── (자동 재큐잉 1회) ──▶ queued
        │                                                       │
        ▼                                                       │
    generating ──── (성공) ──▶ completed ──── (사용자 확정) ──▶ active
        │                                                       │
        └──── (실패) ──────▶ failed                              │
                                                                │
                              active ──── (기간 종료) ──────▶ completed
                                │                               │
                                └── (DELETE /meal-plans/:id) ──▶ archived
                                                                │
                          draft ◀── (PATCH, 수동 편집 Phase 2)   │
                            │                                   │
                            └── (사용자 확정) ──────────────────▶ active

  ※ DELETE /meal-plans/:id = status를 'archived'로 변경 (deleted_at 아님)
  ※ soft delete(deleted_at)는 관리자 전용 배치 작업에서만 사용
```

| Status | 설명 | 진입 조건 | 클라이언트 행동 |
|--------|------|----------|---------------|
| `queued` | SQS에 등록됨, 처리 대기 | POST /generate 호출 | 폴링 또는 WebSocket 대기 |
| `generating` | AI 엔진이 처리 중 (Pass 1 → Pass 2) | SQS consumer가 픽업 | 진행률 표시 |
| `completed` | 생성 완료, 데이터 조회 가능 | AI 엔진 처리 성공 또는 active 기간 종료 | 결과 화면 또는 이력 |
| `failed` | 생성 실패 | AI 엔진 오류 (2회 재시도 후) | 에러 메시지 + 재시도 버튼 |
| `expired` | 5분 내 처리 미시작 (큐 정체) | TTL 초과 | 자동 재큐잉 1회 시도 |
| `draft` | 사용자 수동 편집 초안 (Phase 2) | PATCH로 수동 생성 | 편집 화면 |
| `active` | 현재 사용 중인 식단 | 사용자 확정(confirm) | My Plan 탭 표시 |
| `archived` | 보관된 과거 식단 | DELETE /meal-plans/:id | 이력에서 조회 가능 |

**폴링 계약:**
- 엔드포인트: `GET /v1/meal-plans/{id}` (status 필드 확인)
- 폴링 간격: 2초 시작, 지수 백오프 (2s → 4s → 8s), 최대 간격 10초
- 최대 대기: 60초. 초과 시 클라이언트에서 타임아웃 처리

**WebSocket 계약:**
- 채널 경로: `/ws/meal-plans/{id}/status` (상대 경로, 아래 base URL과 결합)
- Base URL: `wss://api.celebbase.com` (환경별: `.env`의 `WS_BASE_URL`)
- 인증: **Short-lived WS Ticket 방식** (JWT를 query param으로 전달하지 않는다 — 서버 로그/리퍼러 헤더에 토큰 노출 위험)
  1. 클라이언트가 `POST /ws/ticket` (Bearer JWT 헤더)으로 1회용 티켓 발급 요청
  2. 서버가 `{ "ticket": "ws_xxx", "expires_in_sec": 30 }` 반환 (TTL 30초, 1회 사용)
  3. 클라이언트가 `{WS_BASE_URL}/ws/meal-plans/{id}/status?ticket=ws_xxx`로 연결
  4. 서버가 티켓 검증 후 즉시 폐기 (재사용 불가)
- 이벤트 페이로드:
```json
// 진행률 업데이트
{ "event": "progress", "status": "generating", "pass": 1, "pct": 100 }
{ "event": "progress", "status": "generating", "pass": 2, "pct": 45 }

// 완료
{ "event": "completed", "plan_id": "uuid", "summary": { "days": 7, "avg_kcal": 1850 } }

// 실패
{ "event": "failed", "error_code": "GENERATION_FAILED", "message": "...", "retriable": true }
```

**재시도 정책:**
- 자동 재시도: AI 엔진 내부 오류(OOM, 타임아웃) 시 **1회 자동 재시도** (SQS redrive)
- 사용자 재시도: `failed` 상태에서 `POST /meal-plans/{id}/regenerate` 호출 (할당량 차감 없음)
- DLQ: 2회 연속 실패 시 Dead Letter Queue로 이동, 운영팀 알림

#### 4.3 Subscription Quota Rules

구독 티어별 사용량 제한의 정확한 계산 규칙:

| Rule | Detail |
|------|--------|
| **카운팅 기준** | `meal_plans.created_at` 기준 (생성 요청 시점) |
| **기간 경계** | 매월 1일 00:00:00 UTC 리셋 (사용자 로컬 시간 아님) |
| **부분 실패 처리** | `status = 'failed'`인 플랜은 할당량에서 **차감하지 않음** |
| **재생성(regenerate)** | 기존 플랜의 재생성은 할당량에서 **차감하지 않음** (동일 plan_id) |
| **관리자 오버라이드** | `subscriptions.quota_override JSONB` 필드로 개별 사용자 한도 조정 가능 |
| **멱등성** | 동일 `user_id + base_diet_id + duration_days + normalized_preferences` 조합의 중복 요청은 5분 내 멱등 처리 (기존 plan 반환) |
| **한도 초과 응답** | `429 PLAN_LIMIT_REACHED` + `Retry-After` 헤더 (다음 리셋까지 남은 초) |

#### Commerce (Instacart)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/meal-plans/:id/cart` | 식단 재료 → 인스타카트 장바구니 생성 | JWT |
| GET | `/meal-plans/:id/cart/preview` | 장바구니 미리보기 (가격 포함) | JWT |
| POST | `/meal-plans/:id/cart/checkout` | 인스타카트 체크아웃 URL 생성 | JWT |
| GET | `/orders` | 주문 내역 | JWT |
| GET | `/orders/:id` | 주문 상세 | JWT |

#### Recipes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/recipes/:id` | 레시피 상세 (영양정보, 재료, 단계) | JWT |
| GET | `/recipes/:id/personalized` | 개인화 적용된 레시피 | JWT |
| GET | `/recipes/search` | 레시피 검색 (Elasticsearch) | JWT |

#### Tracking

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/daily-logs` | 일일 기록 작성 | JWT |
| GET | `/daily-logs` | 기록 목록 (date range 필터) | JWT |
| GET | `/daily-logs/summary` | 주간/월간 통계 요약 | JWT |

#### Subscriptions

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/subscriptions` | 구독 시작 (Stripe — web 잔존, 현재 미사용) | JWT |
| GET | `/subscriptions/me` | 내 구독 정보 | JWT |
| POST | `/subscriptions/me/cancel` | 구독 해지 (Stripe path) | JWT |
| POST | `/webhooks/stripe` | Stripe 웹훅 수신 (web 잔존) | Stripe Sig |
| POST | `/webhooks/revenuecat` | RevenueCat 웹훅 수신 (mobile IAP) — `entitlement_id` → `subscription_tier` 매핑 후 `subscriptions` 갱신 + `processed_events` idempotency 기록 (PIVOT-MOBILE-2026-05, IMPL-MOBILE-PAY-001b / PR #39) | RevenueCat `Authorization` header secret |

**Internal (service-to-service)** *(PIVOT-MOBILE-2026-05)*:

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/internal/subscriptions/refresh-from-revenuecat` | mobile pull-sync 진입점 (IMPL-MOBILE-SUB-SYNC-001b). 상세 명세는 본 표 아래 섹션 참조. | Internal JWT (audience = `commerce-service:internal`) |

##### `/internal/subscriptions/refresh-from-revenuecat` 상세 *(IMPL-MOBILE-SUB-SYNC-001b)*

mobile client → BFF `POST /api/subscriptions/sync` (IMPL-MOBILE-SUB-SYNC-002) → 본 endpoint 로 위임. commerce-service 가 RevenueCat REST API 를 조회하여 entitlement → tier 를 도출한 뒤 `subscriptions` upsert + user-service `/internal/users/:id/tier` 동기화를 한 번에 수행한다.

**Request body**:
```json
{ "user_id": "<UUID v7>", "source": "purchase" | "app_open" | "manual" }
```

**Response 200**:
```json
{ "user_id": "<UUID>", "tier": "free|premium|elite", "status": "active|past_due|cancelled|expired|free", "current_period_end": "<ISO8601 | null>", "source": "<request 와 동일>" }
```

**에러**:
- `502 REVENUECAT_UNAVAILABLE` — circuit breaker open 또는 upstream 5xx
- `400 VALIDATION_ERROR` — body shape 위반
- `401 UNAUTHORIZED` — internal JWT 누락 / audience mismatch / jti replay

**Idempotency**: user-service `/internal/users/:id/tier` 호출 시 idempotencyKey = `${userId}:${tier}:sync:${period_end_ms}`. 동일 sync 상태 (RevenueCat 측 변경 없음) 재호출은 user-service 가 409 DUPLICATE_REQUEST 로 응답 → commerce 가 silent skip 후 200 으로 정상 응답.

**캐시 정책 (CHORE-SUB-CACHE-001 active)**: source-aware in-memory cache + single-flight 가 `services/commerce-service/src/services/revenuecat-sync.service.ts` 의 `syncFromRevenuecat` 진입부에 적용.
- `source=purchase` → cache 우회 (방금 결제 직후 — 항상 RevenueCat REST API fresh fetch). 결과는 cache 에 populate 하여 후속 `app_open` 가 즉시 활용.
- `source=app_open` / `source=manual` → 60s TTL cache hit, miss 시 fresh fetch 후 populate.
- **Single-flight**: 동일 user_id 의 동시 in-flight 요청은 1개만 RevenueCat REST API 를 호출하고 나머지는 동일 Promise 결과를 await (Plan v5 §M5 single-flight 요구사항 충족, RevenueCat quota 보호).
- Cache 는 module-level Map (in-memory, per-process). multi-instance 운영 시 instance 별 독립 — sticky session 또는 분산 cache 는 본 chore 범위 외. response 의 `source` 필드는 caller 의 원래값으로 re-stamp (cache value 는 source 제외).

**구현 history**: PR #41 (SUB-SYNC-001) 이 webhook + adapter + `handleWebhookEvent` + `upsertRevenuecatSubscription` 까지 ship 했고, IMPL-MOBILE-SUB-SYNC-001b (본 항목) 가 internal route 자체 + `syncFromRevenuecat()` helper 추출 + commerce 측 internal JWT middleware 를 backfill.

---

## 5. AI Personalization Engine

### 5.1 Overview

Meal Plan Engine은 독립된 Python(FastAPI) 마이크로서비스로 운영되며, SQS를 통해 메인 백엔드와 비동기 통신한다.

### 5.2 Personalization Pipeline

```
INPUT                           PROCESSING                      OUTPUT
─────                           ──────────                      ──────
┌─────────────┐         ┌─────────────────────────┐     ┌───────────────┐
│ Base Diet   │────────▶│ 1. Calorie Adjustment   │     │ Personalized  │
│ (celebrity) │         │    (TDEE × goal factor) │     │ Meal Plan     │
├─────────────┤         ├─────────────────────────┤     │               │
│ Bio Profile │────────▶│ 2. Macro Rebalancing    │     │ - Daily meals │
│ (user)      │         │    (protein priority)   │     │ - Recipes     │
├─────────────┤         ├─────────────────────────┤     │ - Adjusted    │
│ Preferences │────────▶│ 3. Allergen Filtering   │     │   nutrition   │
│ & Goals     │         │    + Substitution       │     │ - Shopping    │
└─────────────┘         ├─────────────────────────┤     │   list        │
                        │ 4. Micronutrient Check  │     └───────────────┘
                        │    (RDA compliance)     │
                        ├─────────────────────────┤
                        │ 5. Variety Optimization │
                        │    (7-day diversity)    │
                        ├─────────────────────────┤
                        │ 6. Budget Constraint    │
                        │    (ingredient pricing) │
                        └─────────────────────────┘
```

### 5.3 Algorithm Details

**Step 1: Calorie Adjustment**
```
target_kcal = TDEE × goal_factor

goal_factor:
  weight_loss       → 0.80 (20% deficit)
  muscle_gain       → 1.15 (15% surplus)
  maintenance       → 1.00
  glp1_support      → 0.90 (muscle-sparing moderate deficit)
  athletic_performance → 1.10–1.25 (activity-dependent)
```

**Step 2: Macro Rebalancing**
```
protein_g = weight_kg × effective_protein_multiplier

# 1단계: 활동 수준 기반 기본값
activity_base_multiplier:
  sedentary         → 1.2 g/kg
  light             → 1.4 g/kg
  moderate          → 1.6 g/kg
  active            → 1.8 g/kg
  very_active       → 2.0 g/kg

# 2단계: 목표 기반 조정 (기본값보다 높을 때만 적용)
goal_minimum_multiplier:
  weight_loss       → 1.4 g/kg  (근육 보존)
  muscle_gain       → 2.2 g/kg
  glp1_support      → 2.2 g/kg  (근육 손실 방지)
  athletic_performance → 2.0 g/kg
  maintenance       → (조정 없음, 활동 기본값 사용)

# 결정 규칙: 둘 중 큰 값을 사용
effective_protein_multiplier = MAX(activity_base, goal_minimum)
# 예: active(1.8) + glp1_support(2.2) → 2.2 적용
# 예: very_active(2.0) + weight_loss(1.4) → 2.0 적용

# 클램핑: CLAUDE.md § 12.1 NUTRITION_BOUNDS 적용
effective_protein_multiplier = CLAMP(effective, 0.8, 3.0)
```

```
remaining_kcal = target_kcal - (protein_g × 4)
fat_kcal = remaining_kcal × base_diet.fat_ratio
carb_kcal = remaining_kcal × (1 - base_diet.fat_ratio)
```

**Step 3: Allergen Filtering**
- 사용자의 `allergies[]` 및 `intolerances[]` 에 해당하는 재료를 포함한 레시피를 자동 대체
- 대체 재료 매핑 테이블(substitution_map)에서 영양소 프로필이 가장 유사한 대안 선택
- 대체 불가능한 경우 해당 레시피 전체를 같은 meal_type의 다른 레시피로 교체

**Step 4: Micronutrient Adequacy Check**

각 식단의 1일 / 7일 평균 영양소 totals 를 **NIH Office of Dietary Supplements DRI 표** (성인 19-50) 기준 RDA 와 비교한다. (https://ods.od.nih.gov/HealthInformation/nutrientrecommendations.aspx)

**추적 영양소 18개**:
- 매크로 관련: `fiber_g` (25g)
- 비타민: `vitamin_a_ug_rae` (900µg / 700µg female), `vitamin_c_mg` (90), `vitamin_d_ug` (15), `vitamin_e_mg` (15), `vitamin_k_ug` (120 / 90 female), `vitamin_b6_mg` (1.3), `vitamin_b12_ug` (2.4), `folate_ug_dfe` (400)
- 미네랄: `calcium_mg` (1000), `iron_mg` (8 / 18 female), `magnesium_mg` (420 / 320 female), `zinc_mg` (11 / 8 female), `potassium_mg` (3400), `phosphorus_mg` (700), `selenium_ug` (55), `iodine_ug` (150)
- 지방산: `omega3_g` (1.6 / 1.1 female)

**컴플라이언스 기준**: 일별 RDA 대비 70% 이상 (`MIN_COMPLIANCE = 0.70`). 미달 시 `deficient` 리스트 + 보충제 제안 (`_SUPPLEMENTS`).

**Sex 파라미터**: `check_micronutrients(daily_totals, sex)` — `"male"` (baseline RDA), `"female"` (Fe/Vit A/K/Mg/Zn/omega3 override), `"unisex"` (default, male baseline).

**Weekly 모드**: `check_weekly_avg(weekly_totals: list[dict], sex)` — 7일 평균 계산 후 `check_micronutrients` 위임.

**LLM 금지**: 영양 수치 RDA 값 생성에 LLM 사용 절대 금지 — NIH ODS / IOM DRI 공식 표만 (§5.5 Provenance 와 일관).

**Step 5: Variety Optimization**
- 7일 식단 내 동일 레시피 최대 2회 반복 제한
- 동일 주 재료(primary ingredient) 연속 사용 제한
- meal_type별 균형 유지

### 5.4 Model Serving

| Component | Tech |
|-----------|------|
| Substitution Engine | Rule-based + Embedding similarity (sentence-transformers) |
| Nutrition Optimizer | Linear Programming (scipy.optimize) |
| Recipe Recommender | Collaborative Filtering + Content-based hybrid (LightFM) |
| Future: NLP Recipe Parser | Fine-tuned LLM for 비정형 식단 정보 파싱 |

### 5.5 Nutrition Data Standardization Layer

영양 데이터는 USDA FoodData Central, Instacart 제품 카탈로그, 수동 입력 등 **이종 소스**에서 유입된다. 소스별 필드명, 단위, 정밀도가 상이하므로 반드시 표준화 레이어를 거쳐야 한다.

**문제 예시**: USDA는 비타민D를 `µg` 단위로 제공하나, 레시피 DB는 `IU` 단위를 사용 (1µg = 40 IU). 변환 누락 시 영양소 계산 20~30% 편차 발생.

**표준 스키마 (`packages/shared-types/nutrition.ts`)**:
```typescript
interface NutritionStandard {
  source: 'usda_fdc' | 'instacart' | 'manual';
  source_version: string;           // e.g. "usda-fdc-2026-q1"
  values: {
    calories_kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
    sodium_mg: number;
    micronutrients: Record<string, {
      value: number;
      unit: 'mg' | 'µg' | 'IU';    // 표준 단위로 정규화 후 저장
      confidence: number;            // 0.0–1.0 (소스 신뢰도)
    }>;
  };
}
```

**변환 파이프라인 (`meal-plan-engine/src/engine/nutrition_normalizer.py`)**:
```
[Raw USDA data]  ──→  NutritionNormalizer  ──→  NutritionStandard
[Instacart data] ──→  (단위 변환, 서빙 정규화) ──→  (공통 스키마)
[Manual entry]   ──→                        ──→
```

**검증 규칙**:
- USDA ↔ Instacart 동일 재료의 단백질 편차가 ±5% 초과 시 경고 로그 출력
- 칼로리 합산 오차 ±10% 초과 시 관리자 리뷰 플래그
- USDA 데이터 타입 우선순위: Foundation Foods > SR Legacy > Branded > FNDDS

### Nutrition Provenance Enforcement (CHORE-CONTENT-001 시리즈)

영양 수치의 출처를 강제 추적한다 — `ingredients.nutrition_source` + `recipes.nutrition_source` 컬럼.

**Ingredient-level**:
- `usda_fdc`: USDA FoodData Central API (`api.nal.usda.gov/fdc/v1`) 에서 직접 조회. `fdc_id` + `nutrition_updated_at` 기록.
- `nih_ods`: NIH Office of Dietary Supplements DRI 표 (predefined).
- `manual_verified`: 수동 입력 + 검증자 sign-off.
- `NULL`: 백필 전 상태 (CHORE-CONTENT-001-a 머지 후 일시적).

**Recipe-level**:
- `derived_from_ingredients`: 모든 ingredient 가 `usda_fdc`/`nih_ods` 이고 `recompute-recipe-nutrition.ts` 가 계산.
- `manual_verified`: 수동 입력 검증.
- `manual_legacy`: 초기 seed 의 수동 추정값. 신규 plan 에 사용 가능하나 신뢰도 ↓.

**Backfill 절차** (one-shot, idempotent):
1. `tsx db/seeds/scripts/backfill-ingredient-nutrition.ts --review-only` → `review.csv` 생성
2. (수동) `review.csv` 의 `accepted_fdc_id` 컬럼 채움
3. `tsx db/seeds/scripts/backfill-ingredient-nutrition.ts` → ingredients.nutrition_per_100g 채움
4. `tsx db/seeds/scripts/recompute-recipe-nutrition.ts` → recipes.nutrition 재계산

**LLM 금지**: 영양 수치 생성·추정에 LLM 사용 절대 금지. USDA FDC / NIH ODS / manual verified 만.


### 5.6 Two-Pass Meal Plan Generation (체감 대기 시간 최적화)

15초 전체 처리를 기다리는 대신, **즉시 초안 → 백그라운드 최적화** 2단계로 분리하여 체감 대기 시간을 80% 단축한다.

```
[사용자 요청]
      │
      ▼
┌─────────────────────────────────────────┐
│  Pass 1: Quick Draft (목표 3초)         │
│  - 캐시된 인기 레시피 조합 사용          │
│  - 칼로리만 TDEE 기준 조정              │
│  - 알레르겐 기본 필터링 (exact match)    │
│  → 사용자에게 즉시 미리보기 제공         │
│    "정밀 개인화 중... (10초 예상)"       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Pass 2: Deep Optimization (목표 12초)  │
│  - 매크로 정밀 재분배                    │
│  - 대체 재료 영양소 최적 매칭            │
│  - 미량영양소 RDA 충족률 검증            │
│  - 7일 다양성 최적화                     │
│  → WebSocket/Push로 최종본 전달          │
│    초안 대비 변경점 하이라이트            │
└─────────────────────────────────────────┘
```

**캐시 사전 워밍 (Pre-warming)**:
- 매일 02:00 UTC, 최근 30일 사용량 상위 10개 셀럽 식단의 인기 레시피 조합을 Redis에 캐싱 (`popular_combo:{base_diet_id}`, TTL 24h)
- 캐시 히트 시 Pass 1 소요 시간: ~1초

### 5.7 PHI(보호건강정보) 최소화 원칙

AI 엔진에 사용자 건강 데이터를 전달할 때, **태스크에 필요한 최소한의 필드만** 전송한다.

| Task | 전달 필드 | 전달하지 않는 필드 |
|------|----------|-------------------|
| 칼로리 계산 | weight_kg, height_cm, activity_level, primary_goal | biomarkers 전체, medications, medical_conditions |
| 매크로 재분배 | weight_kg, activity_level, diet_type | 혈액 검사 결과, 알레르기 상세 |
| 알레르겐 필터링 | allergies[], intolerances[] | 체중, 바이오마커, 의료 이력 |
| GLP-1 사용자 조정 | weight_kg, primary_goal='glp1_support' | 기타 바이오마커 |
| **LLM 랭킹 (§5.8)** | **primary_goal, activity_level, diet_type** | **allergies, 체중, 의료 이력 전체** |
| 바이오마커 기반 조정 (Phase 2) | 해당 바이오마커만 선택적 | 나머지 전체 |

```python
# meal-plan-engine/src/engine/phi_minimizer.py
def minimize_profile(full_profile: BioProfile, task: PipelineTask) -> dict:
    """태스크에 필요한 최소 PHI만 추출하여 반환."""
    TASK_FIELD_MAP = {
        'calorie_adjustment': ['weight_kg', 'height_cm', 'activity_level', 'primary_goal'],
        'macro_rebalance': ['weight_kg', 'activity_level', 'diet_type'],
        'allergen_filter': ['allergies', 'intolerances'],
        'glp1_adjustment': ['weight_kg', 'primary_goal'],
        'llm_ranking': ['primary_goal', 'activity_level', 'diet_type'],  # §5.8 — allergies 전달 금지
    }
    allowed = TASK_FIELD_MAP.get(task, [])
    return {k: getattr(full_profile, k) for k in allowed if hasattr(full_profile, k)}
```

---

### 5.8 LLM Enhancement Layer

> **상태**: 설계 확정 (IMPL-AI-001-a). 구현은 IMPL-AI-001-b ~ -f 시리즈.  
> **근거**: `docs/LLM-DESIGN.md` v1.0

#### 역할 경계

| 역할 | 담당자 | 설명 |
|------|--------|------|
| Recipe ranking (persona affinity) | **LLM** | `variety_optimizer` 결과 pool 안 순위 재배열만 |
| Persona narrative text | **LLM** | 1–2 문장, 출처(Citation) 강제 |
| 칼로리·매크로·알레르겐·단위 변환 | **Rule Pipeline** | LLM 접근 금지 |
| Safety validation | **Rule Pipeline** | 6개 Safety Gate (Gate 0–5) |

#### PHI Boundary

`phi_minimizer.py` `TASK_FIELD_MAP`에 `llm_ranking` 슬라이스 추가 (IMPL-AI-001-c):

| Task | 전달 필드 |
|------|----------|
| `llm_ranking` | `primary_goal`, `activity_level`, `diet_type` — 3개 한정 |

`user_id` → HMAC-SHA256 pseudonym 전달 (원본 UUID 전달 금지).  
`allergies`, `weight_kg` 등 일체 전달 금지 — 알레르겐 안전성은 결정론 Gate에서만 보장.

#### Mode Flag API 계약

모든 `/meal-plans/generate` 응답 payload에 다음 필드 포함:

```json
{
  "mode": "llm | standard",
  "quota_exceeded": false,
  "ui_hint": null
}
```

`mode: "standard"` 시 `ui_hint`: `"일시적인 지연으로 기본 식단을 제공합니다."`

#### 비용 Cap

| 항목 | 값 | 근거 |
|------|-----|------|
| per-plan hard cap | ≤ $0.05 | Celebase_Proposal.docx line 305 |
| Elite 일일 soft limit | 3회 | Gemini BS-04 반영 |
| 월간 warn (MAU 10K) | $500 | MAU 기반 재산정 |
| 월간 kill (MAU 10K) | $1,000 | Redis `llm_disabled=true` 자동 설정 |

#### PolicyEngine 경계 (Year 3+ 확장성)

```python
class PolicyEngine(ABC):
    def validate_plan(self, plan: LlmRankedMealList, policy_ctx: dict) -> None: ...
    def load_prompt_schema(self, tenant_id: Optional[str] = None) -> PromptSchema: ...
```

MVP 구현체: `GlobalPolicyEngine` 단일 인스턴스.  
`llm_reranker.py`, `llm_safety.py`는 `PolicyEngine` 인터페이스만 의존 (DI).

---

## 6. Instacart Integration

### 6.1 Integration Architecture

```
[Meal Plan Confirmed]
        ↓
[Ingredient Aggregation]  ← 7일 식단 전체 재료 합산 & 중복 제거
        ↓
[Instacart Product Mapping]  ← ingredients.instacart_product_id
        ↓
[Cart Preview API]  ← 가격/재고 확인
        ↓
[User Review & Confirm]
        ↓
[Instacart Checkout Deep Link]  ← 인스타카트 앱/웹으로 리디렉트
```

### 6.2 API Integration Points

- **Instacart Connect (IDP)**: 파트너 API를 통한 장바구니 생성
- **Product Catalog Sync**: 일별 배치로 제품 카탈로그 동기화 (ingredient 테이블 업데이트)
- **Price Estimation**: 장바구니 미리보기 시 실시간 가격 조회
- **Checkout Redirect**: 사용자를 Instacart 결제 플로우로 핸드오프
- **Webhook**: 주문 상태 업데이트 수신 (confirmed, delivered 등)

### 6.3 Error Handling Policies

| Scenario | Response | User-Facing Behavior |
|----------|----------|---------------------|
| **상품 재고 소진** | 동일 카테고리 내 대체 상품 자동 추천 (가격 ±20% 이내) | "Organic Avocado 품절 → Hass Avocado로 대체됨" 알림 |
| **상품 매핑 실패** (Instacart에 없는 재료) | 해당 재료를 장바구니에서 제외 + 인터랙티브 체크리스트에 포함 | "3개 품목은 직접 구매가 필요합니다" 안내 |
| **Instacart API 타임아웃** (>5s) | Circuit breaker open → 캐시된 가격으로 미리보기 제공 | "예상 가격으로 표시됩니다" 배지 |
| **Instacart API 인증 실패** (401/403) | 자동 토큰 갱신 1회 시도 → 실패 시 사용자 재연동 유도 | "Instacart 연결을 갱신해 주세요" 딥링크 |
| **Instacart 완전 장애** (5xx, circuit open) | Amazon Fresh 자동 전환 시도 → 실패 시 인터랙티브 쇼핑 리스트 생성 | "대체 배송 서비스로 전환 중..." 또는 "쇼핑 체크리스트를 확인하세요" |
| **서비스 불가 지역** | 지역 감지 → 배송 불가 안내 + 인터랙티브 체크리스트 폴백 | "해당 지역은 배송 미지원입니다. 매장 쇼핑 리스트를 확인하세요" |
| **부분 실패** (일부 상품만 추가 성공) | 성공 품목으로 장바구니 생성 + 실패 품목 별도 표시 | 장바구니에 "N개 품목 추가 실패" 배너 |

**Fallback Priority:**
1. 대체 상품 자동 추천 (같은 카테고리 내)
2. Amazon Fresh / Whole Foods 대체 연동 (Phase 2)
3. 인터랙티브 쇼핑 체크리스트 (웹 기반, 매장 통로별 그룹핑, 체크 기능 — PDF 대체)

### 6.4 Instacart Batch Processing (성능 최적화)

7일 식단의 재료 70여 개를 순차 API 호출하면 14초 이상 소요된다. 배치 처리로 최적화한다.

```
1. Redis에서 재료 ID 기준 일괄 캐시 조회 (mget)
2. 캐시 미스 재료만 Instacart Batch Search API 호출 (1회 요청으로 다건 처리)
3. 응답을 Redis에 캐싱 (TTL 24h, 가격은 TTL 1h)
```

**목표**: 장바구니 생성 14초 → 1.2초 (초회), 0.3초 (캐시 히트 시)

---

## 6A. Trend Intelligence Service (Phase 2+)

> 이 섹션은 Phase 2 이후 구현 대상이다. MVP에서는 편집팀이 수동으로 셀럽 식단 데이터를 관리한다.
> Phase 1 아키텍처는 아래 서비스를 나중에 플러그인할 수 있도록 **Content Service에 이벤트 기반 업데이트 인터페이스**를 미리 설계한다.
>
> **PIVOT-2026-05 cross-ref**: Phase 1 의 사용자 노출 데이터는 §3.5 LifestyleClaim (편집팀 큐레이션 + trust_grade) 이다. Trend Intelligence (이 섹션, Phase 2+) 는 §3.5 lifestyle_claims 테이블에 자동으로 `draft` 후보를 적재하는 백엔드 파이프라인으로 진화한다. trend_signals 의 `parsed_data` → lifestyle_claims (draft, trust_grade='D' or 'E') → human moderation (IMPL-021) → published 의 흐름.

### 6A.1 개요

Trend Intelligence Service는 셀러브리티의 실시간 라이프스타일 변화를 감지하고, Content Service의 base_diet 데이터를 동적으로 업데이트하는 백그라운드 파이프라인이다.

### 6A.2 Pipeline Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Data Collectors │────▶│  NLP Processor   │────▶│  Trend Curator   │
│                  │     │                  │     │  (Human-in-Loop) │
│  - Instagram API │     │  - Entity Recog  │     │                  │
│  - TikTok API    │     │  - Food/Suppl    │     │  - Verify claims │
│  - RSS/News      │     │    extraction    │     │  - Approve/reject│
│  - YouTube       │     │  - Sentiment     │     │  - Nutrition QA  │
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                           │
                                                           ▼
                                                  ┌──────────────────┐
                                                  │  Content Service │
                                                  │  (SNS Event →    │
                                                  │   base_diet      │
                                                  │   update)        │
                                                  └──────────────────┘
```

### 6A.3 핵심 설계 원칙

1. **Human-in-the-Loop 필수**: AI가 감지한 트렌드는 자동으로 사용자에게 노출되지 않는다. 편집팀의 승인(approve) 후에만 base_diet에 반영된다.
2. **출처 투명성**: 모든 트렌드 데이터에는 원본 소스 URL, 감지 일시, 신뢰도 점수가 기록된다.
3. **법적 안전장치**: 셀러브리티의 공개 게시물만 수집한다. DM, 비공개 계정, 삭제된 콘텐츠는 수집하지 않는다. SNS 플랫폼 ToS를 준수한다.
4. **Dynamic Base Layer**: 셀럽의 식단 변화가 승인되면, 해당 셀럽을 추종하는 활성 meal plan 사용자에게 "식단이 업데이트되었습니다. 새 버전을 적용하시겠습니까?" 알림을 전송한다. 자동 변경은 하지 않는다.

### 6A.4 확장 데이터 모델 (Phase 2+)

```sql
-- Phase 2+: Trend Intelligence Tables

CREATE TABLE trend_signals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    celebrity_id    UUID NOT NULL REFERENCES celebrities(id),
    
    source_platform VARCHAR(30) NOT NULL,   -- 'instagram','tiktok','youtube','news'
    source_url      TEXT NOT NULL,
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    signal_type     VARCHAR(30) NOT NULL,   -- 'diet_change','new_supplement','new_routine'
    raw_content     TEXT,                   -- extracted text snippet (fair use length)
    parsed_data     JSONB DEFAULT '{}',
    /*
      parsed_data schema:
      {
        "foods_mentioned": ["acai bowl", "chlorophyll water"],
        "supplements": ["magnesium glycinate"],
        "diet_labels": ["paleo-vegan"],
        "confidence_score": 0.85
      }
    */
    
    status          VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','expired')),
    reviewed_by     VARCHAR(100),           -- editor who approved/rejected
    reviewed_at     TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trends_celeb_status ON trend_signals(celebrity_id, status);
CREATE INDEX idx_trends_detected ON trend_signals(detected_at DESC);
```

### 6A.5 Phase 1 준비사항 (MVP에서 미리 구현)

Content Service에 아래 인터페이스를 미리 설계하여 Phase 2 플러그인을 용이하게 한다:

- `POST /admin/celebrities/:id/diets` — 새 diet 버전 추가 (현재는 관리자 수동, 향후 Trend Service가 호출)
- `POST /admin/base-diets/:id/versions` — 기존 diet의 새 버전 생성 (버전 히스토리 관리)
- SNS 이벤트 `base_diet.updated` — 식단 변경 시 SNS 토픽으로 이벤트 발행 (meal-plan-engine이 구독)

---

## 7. User Flows (Screen-by-Screen)

### 7.1 Onboarding Flow (Persona-First · Plan 20 Phase C-1)

```
[S0: Welcome]
  ↓  "Get Started"
[S1: Auth]  ← Apple/Google SSO or Email
  ↓
[S2: Persona Select]  ← "Who would you like to live like?" (celebrity grid)
  ↓
[S3: Basic Info]  ← Name, Birth Year, Sex
  ↓
[S4: Body Metrics]  ← Height, Weight, Waist (optional)
  ↓
[S5: Activity & Health]  ← Activity level (5-card) + Allergies / Intolerances / Conditions / Medications
  ↓
[S6: Goals & Diet Preferences]  ← Primary goal + secondary goals + diet type + cuisine preferences
  ↓
[S7: Blueprint Reveal]  ← Mifflin-St Jeor TDEE + persona meal plan preview + Identity Sync Score + Instacart cart preview
```

**전환 근거 (Aspirational Optimizer wedge)**: 이전 data-first 순서 (S3 Basic Info 선행) 는 PHI 수집 후에야 aspirational intent를 락인했다. Persona-first 는 wizard 진입 직후 S2 에서 "Who would you like to live like?" 를 묻고, 그 선택을 `users.preferred_celebrity_slug` 로 영속화하여 Identity Sync Score + Blueprint Reveal 의 앵커로 사용한다.

**Biomarker Upload 는 Phase 2 로 이연** — 수동 입력은 `/settings/health` post-onboarding 에서만 제공. 아래 업로드 계약 테이블은 Phase 2 상세 구현 시점에 다시 활성화된다.

#### S2 Persona Select (new)

| Layer | Contract |
|-------|----------|
| **Functional** | 2-col desktop / 1-col ≤720px grid. `GET /api/celebrities` 응답 기반. 카드 = hero image + celebrity name + 1-line wellness philosophy + (optional) match-score chip (persona accent 토큰). 선택 필수 — "Continue" 는 선택 전까지 disabled. |
| **Persistence** | 확정 시 `PATCH /api/users/me { preferred_celebrity_slug: "<slug>" }` 호출. 실패 시 inline error + step 유지. **GDPR 소거**: 사용자가 S2 이후 wizard 를 중단하면 `users.preferred_celebrity_slug` 는 bio_profiles row 없이도 영속될 수 있다. 계정 삭제 요청 시 standard `users` row 삭제 (soft-delete → 유예 30일 → hard-delete, `.claude/rules/security.md#계정 삭제`) 에 포함되어 별도 정리 경로를 요구하지 않는다. orphan slug 는 개별 처리 없음. |
| **Async warm-up (timing constraint)** | S2 확정 시점에는 `goal` 과 `wellnessKeywords` 가 아직 수집되기 전이다 (S6 에서 수집). 따라서 persona-match 호출은 **S2 가 아닌 S6 Continue 트리거로 이동**한다. S2 는 persona slug 만 저장하고 async 호출을 하지 않는다. 상세 계약은 S6 Persistence row 참조. |
| **Verification** | (1) Playwright E2E: `/onboarding` → Tom Brady 카드 선택 → Continue → `PATCH /api/users/me` request body 에 correct slug 확인 → S3 진입. (2) Playwright E2E: S2 Continue 직후 network log 에 `/api/persona-match` 호출 **부재** (S6 Continue 가 유일한 트리거). (3) `curl -X POST /api/persona-match -d '{"bioProfile":{...}}'` → 400 `PHI_EXPOSURE`. (4) `rg preferred_celebrity_slug packages/shared-types services/user-service` 로 wire + entity + repository 일치. |
| **Provenance** | Composite: `PersonaHero` + `CelebrityCard` (`@celebbase/ui-kit`). IMPL 엔트리: `IMPL-BE-users-preferred-celebrity` (Phase C-0) + `IMPL-APP-001` (Phase C-2). |

#### S3 Basic Info

| Layer | Contract |
|-------|----------|
| **Functional** | 1 question/screen. Fields: `display_name` (string, 1-60자), `birth_year` (int, 1900 ≤ y ≤ 현재년도 − 13), `sex` (enum: `male` / `female` / `other` / `prefer_not_to_say`). 단일 inline error. |
| **Persistence** | S3-S6 입력은 client state 에만 보관. 실제 서버 write 는 S7 Confirm 시점에 `POST /api/users/me/bio-profile` 단일 호출로 묶인다 (PHI 감사 로그 단일 write). |
| **Verification** | (1) Zod `WizardStep1Schema` 경계값 테스트 — `birth_year = 1899` 및 `현재년도 − 12` 모두 `safeParse().success === false`. (2) Playwright E2E: 빈 `display_name` 에서 Continue 비활성화. |
| **Provenance** | `WizardStep1Schema` 재사용 (Phase C-2 에서 위치 재배열, field 정의 불변). |

#### S4 Body Metrics

| Layer | Contract |
|-------|----------|
| **Functional** | Fields: `height_cm` (100-250), `weight_kg` (30-300), `waist_cm` (40-200, optional). Unit toggle cm↔in, kg↔lb — display 변환만, persistence 는 metric 고정. |
| **Persistence** | Client state — S7 Confirm 시점에 `POST /api/users/me/bio-profile` 로 묶여 전송. |
| **Verification** | (1) Zod `WizardStep2Schema` boundary 테스트. (2) Playwright E2E: in 선택 시 `70 in` 입력 → `height_cm ≈ 177.8` persist. (3) Optional `waist_cm` 미입력 시 submit 성공. |
| **Provenance** | `WizardStep2Schema` 재사용 (`activity_level` 필드는 S5 로 시각적 재그룹핑되나 스키마 unchanged). |

#### S6 Goals & Diet Preferences

| Layer | Contract |
|-------|----------|
| **Functional** | Fields: `primary_goal` (enum), `secondary_goals` (enum[] ≤ 3), `diet_type` (enum), `cuisine_preferences` (string[]), `disliked_ingredients` (string[], optional). Large radio card for primary goal. GLP-1 primary goal 선택 시 Digital Lavender accent. |
| **Persistence (persona-match trigger)** | Client state 저장. S6 Continue 버튼이 두 동작을 수행한다: (1) `POST /api/persona-match { celebritySlug, goal: primary_goal, wellnessKeywords }` 비동기 호출 — Identity Sync Score 계산이 S7 렌더와 병렬 진행된다. (2) S7 로 네비게이션. 최종 bio-profile write 는 S7 Confirm 에서 `POST /api/users/me/bio-profile` 로 별도 처리. **Race-condition 계약 (Gemini HIGH-G1)**: 재진입 시나리오 (S6 → S7 → "Adjust goals" → S6 → Continue) 에서 client 는 이전 in-flight persona-match 를 `AbortController.abort()` 로 취소한 뒤 새 요청을 발행해야 한다. S7 IdentitySyncScore 는 최신 요청 응답만 소비 (stale response 는 AbortError 로 무시). |
| **Verification** | (1) Zod `WizardStep4Schema` enum 완전성 테스트. (2) Playwright E2E: S6 Continue 직후 network log 에 `/api/persona-match` 호출 정확히 1회 + body 에 `{celebritySlug, goal, wellnessKeywords}` 만 포함 (PHI 필드 부재). (3) persona-match 503 mock 환경에서도 S7 네비게이션은 즉시 성공. (4) **Rapid round-trip (HIGH-G1)**: Playwright E2E S6 → S7 → Adjust goals → S6 (edit `primary_goal`) → Continue → HAR 에 완료된 `/api/persona-match` 요청 정확히 1회 (이전 요청은 `cancelled` status) + S7 IdentitySyncScore 는 최신 goal 기반 응답을 표시. |
| **Provenance** | `WizardStep4Schema` 재사용. Persona-match 트리거를 S6 Continue 로 고정한 것은 Codex Round 1 HIGH-1 수정 결과 (2026-04-22). |

#### S5 Activity & Health (merged — replaces prior S5 + S6)

| Layer | Contract |
|-------|----------|
| **Functional** | 상단: 5-card activity level selector (sedentary / light / moderate / active / very_active). 하단: Allergies · Intolerances · Conditions · Medications 태그 입력. 이 step 에서 처음으로 Health Disclaimer 노출 (`.claude/rules/domain/content.md#Health Disclaimer`). GLP-1 medication 자동 감지: `medications` 에 GLP-1 keyword 포함 시 Digital Lavender (`--cb-accent-glp1`) 칩 + §7.5 conditional text 링크. |
| **A11y** | Activity 5-card 는 roving tabindex (`.claude/rules/domain/content.md#ARIA radio / roving tabindex`). `aria-disabled="true"` 로 native disabled 대체. |
| **Verification** | (1) Unit test: `detectGlp1Medication(medications: string[]): boolean` 이 §7.5 에 명시된 9 개 brand name 에 대해 true. (2) Playwright E2E: "semaglutide" 입력 시 150ms 내 Lavender 칩 노출. (3) Axe on `/slice/composites#activity-health` → 0 serious/critical. |
| **Provenance** | `WizardStep2Schema.activity_level` + `WizardStep3Schema` (field name 불변, 시각적 그룹핑만 변경). |

#### S7 Blueprint Reveal (new — replaces prior S10 Summary + S11 Category)

| Layer | Contract |
|-------|----------|
| **Functional** | Hero: Fraunces display-xl "Your CelebBase Blueprint". 3-column desktop / stacked ≤720px. **Left**: Mifflin-St Jeor TDEE + 3-ring NutritionRing cluster (S3-S6 입력 기반). **Center**: `IdentitySyncScore` overlay (Fraunces display-md) — S2 persona 대비. `POST /api/persona-match` 미도착 시 placeholder region 이 `aria-live="polite"` 로 "Calculating your sync…" 공지. 응답 도착 시 placeholder region 을 `IdentitySyncScore` 컴포넌트로 **교체 (replace, 내부 중첩 아님)** — 컴포넌트 자체는 `aria-live` 를 지정하지 않음 (Gemini MEDIUM-G1: 단일 live region 공지 / 중복 announce 방지). **Right**: 첫 persona meal plan preview (`MealCard` + `TrafficLightIndicator` + `SourceTrackingBadge`). **Bottom**: `InstacartCartPreview` CTA — `INSTACART_IDP_KEY` 미설정 시 503 INSTACART_UNCONFIGURED fallback 으로 dismissible. **Health Disclaimer** (`.claude/rules/domain/content.md#Health Disclaimer`) 는 nutrition summary + meal-plan preview 아래 + primary CTA 위에 `role="note"` 로 상주 렌더 (Codex Round 1 MEDIUM-1). |
| **Load Budget** | p50 < 3s on staging. TDEE 계산은 synchronous, persona-match 는 async (placeholder fallback 허용). **Observability (Gemini LOW-G1)**: client 는 persona-match placeholder 가 S7 mount 기준 +3s 시점에도 노출 중이면 `onboarding.s7.persona_match_timeout` 이벤트를 analytics-service 로 emit. Staging 알람: 같은 이벤트 발생률이 5분 창 내 5% 초과 시 on-call 페이징 (`services/analytics-service` alert rule). |
| **CTA** | "Start my blueprint" → 최종 `POST /api/users/me/bio-profile` (최초 생성 → 201) 로 전체 wizard payload 전송 → 성공 시 `/dashboard` 진입. "Adjust goals" → 뒤로 S6. **실패 복구 (Gemini HIGH-G2)**: 5xx 응답 시 wizard client state (S3-S6 입력) 는 `sessionStorage` 드래프트 키 `cb.onboarding.draft.v1` 에 **이미 단계별로 persist** 되어 있어야 한다. 5xx 에서는 inline retry ("다시 시도") 를 제공하고 S3 로 되돌리지 않음. 브라우저 크래시 / 새로고침 후 재진입 시 드래프트 복원으로 재입력 없이 S7 Confirm 재시도 가능. 드래프트는 201 성공 시 즉시 삭제. |
| **PHI flow** | S7 은 persona-match 에 PHI 를 보내지 않는다. PHI 는 오직 최종 `POST /api/users/me/bio-profile` 단일 채널로만 전송되며 `phi_access_logs` WRITE 를 fail-closed 로 발화 (`.claude/rules/security.md#PHI`). |
| **Verification** | (1) Playwright E2E happy path: S2-S6 완주 → S7 < 3s 렌더 → Identity Sync Score 숫자 또는 placeholder 노출 → Confirm → 201 응답 → `/dashboard` 진입. (2) persona-match 503 mock: S7 여전히 3s 내 렌더 + placeholder + console error 0. (3) Network log 에 `/api/persona-match` body 내 PHI 필드 부재 — automated grep on Playwright HAR. (4) **Audit log happy path**: Confirm 성공 시 `phi_access_logs` 에 정확히 1건 WRITE row 생성 (`target_user_id` = session userId, `action='WRITE'`, `resource='bio_profiles'`) — user-service integration test. (5) **Audit log fail-closed**: BE 에서 `phi_access_logs` insert 를 강제 실패 주입 시 `POST /users/me/bio-profile` 500 반환 + `bio_profiles` row 미생성 (rollback) — user-service integration test. (6) Axe on rendered S7 → 0 serious/critical. (7) Health Disclaimer 회귀: `getByRole('note')` 가 primary CTA 보다 DOM 상 선행. (8) **aria-live 단일 공지 회귀 (MEDIUM-G1)**: Jest + @testing-library — persona-match pending mount 시 `aria-live` 속성을 가진 element 정확히 1개. resolved 상태 mount 시 `IdentitySyncScore` 내부 tree 에 `aria-live` 속성 0개 (placeholder 교체로만 공지). (9) **5xx retry (HIGH-G2)**: MSW 로 `POST /api/users/me/bio-profile` 를 500 → 201 순차 응답 주입. S7 Confirm → 500 → inline retry 버튼 노출 + `sessionStorage['cb.onboarding.draft.v1']` 존재 + S3-S6 state 그대로. 재시도 → 201 성공 + drafts 키 삭제. (10) **persona_match_timeout event (LOW-G1)**: persona-match 응답을 4s 지연 mock → `onboarding.s7.persona_match_timeout` 이벤트가 analytics fetch 에 +3s 시점에 정확히 1건 emit. |
| **Provenance** | Composite stack: `NutritionRing` + `IdentitySyncScore` + `MealCard` + `TrafficLightIndicator` + `SourceTrackingBadge` + `InstacartCartPreview` + `HealthDisclaimer`. BFF routes: `POST /api/persona-match`, `GET /api/meal-plans/:id/safety`, `POST /api/instacart/cart` (503 mock 허용, env 게이트 준수). Drafts key: `cb.onboarding.draft.v1` in `sessionStorage`. Observability event: `onboarding.s7.persona_match_timeout` (analytics-service). |

#### PHI Minimization Contract (§7.1 reiteration · Plan C2)

`/api/persona-match` 의 client → BFF request body 는 **항상** `{ celebritySlug: string, goal: string, wellnessKeywords: string[] }` 만. 두 계층으로 PHI 유입 차단:

1. **Client**: Zod `.strict()` → 알려지지 않은 key 거부.
2. **BFF route** (`apps/web/src/app/api/persona-match/route.ts`): 명시적 denylist (`bioProfile`, `bioProfileMinimal`, `biomarkers`, `medications`, `medicalConditions`, `age`, `weightKg`, `heightCm`, `sex`) → 400 `PHI_EXPOSURE` + upstream 미전달.

PHI 의 진짜 경로는 S7 Confirm 시 `POST /api/users/me/bio-profile` 하나로만 고정되며, 이 경로는 `phi_access_logs` WRITE 가 fail-closed 로 기록된다 (감사 로그 insert 실패 시 bio-profile insert 도 rollback → 500). 후속 PHI 수정 (`PATCH /api/users/me/bio-profile`) 은 post-onboarding 경로이며 §7.1 scope 밖이다.

#### S7 Biomarker Upload — Phase 2 Deferred (기존 업로드 계약 보존)

Phase 1 onboarding 에서는 생략. Phase 2 진입 시 아래 계약을 재활성화하여 `/settings/health/biomarkers/upload` 또는 wizard 내 optional step 으로 노출한다:

| Item | Spec |
|------|------|
| **지원 형식** | JPEG, PNG, PDF (단일 파일) |
| **MIME 허용** | `image/jpeg`, `image/png`, `application/pdf` |
| **최대 파일 크기** | 10MB |
| **최대 페이지** | PDF 5페이지 이하 |
| **저장 위치** | S3 `celebbase-phi/{user_id}/biomarkers/` (암호화, SSE-S3) |
| **OCR 엔진** | AWS Textract (Phase 2) |
| **신뢰도 게이팅** | OCR confidence ≥ 0.85 → 자동 반영, < 0.85 → 사용자 수동 확인 필수 |
| **수동 수정 플로우** | OCR 결과를 편집 가능한 폼으로 제시 → 사용자 확인 후 `bio_profiles.biomarkers`에 저장 |
| **원본 보존** | 원본 파일은 S3에 90일 보존 후 자동 삭제 (S3 Lifecycle). 계정 삭제 시 즉시 삭제 |
| **Phase 1 폴백** | OCR 미구현. 사용자가 직접 숫자 입력하는 폼 제공 (post-onboarding settings) |

#### 7.1 Mobile onboarding S2–S4 (비-PHI) *(PIVOT-MOBILE-2026-05, IMPL-MOBILE-M4-ONBOARD-001)*

`apps/mobile` 의 온보딩 마법사 첫 구현 — Persona Select / Basic Info / Body Metrics 3 단계. **PHI 미포함** (S5 Activity & Health 부터가 PHI 영역, 후속 sub-task `IMPL-MOBILE-M4-PHI-002` 에서 추가).

```
[Claims feed 상단 "📋 프로필 입력하기" link]
        ↓
S2 Persona Select  — GET /api/celebrities (M3 authedFetch 재사용)
  - 셀럽 그리드, 단일 선택, slug 저장 (메모리)
        ↓
S3 Basic Info  — 로컬 입력만 (BE 호출 0)
  - display_name (text), birth_year (1920~CURRENT-13), sex (Sex enum 4종)
        ↓
S4 Body Metrics  — 로컬 입력만
  - height_cm (100~250), weight_kg (30~300), waist_cm (선택, 40~200)
        ↓
[onboarding_complete_placeholder]
  "S5~S7 (활동 · 알러지 · 목표 · 결과) 는 후속 sub-task" 안내 + 홈 복귀
```

**state 관리**: `OnboardingFlow` 컴포넌트가 in-memory draft (`PersonaDraft` / `BasicInfoDraft` / `BodyMetricsDraft`) 만 보관. PHI 가 본 sub-task 에 없으므로 AsyncStorage / SecureStore 영속화도 미사용 — S5 도입 시점에 정책 확정.

**BE 호출 정책**:
- S2 의 셀럽 grid: BFF `GET /api/celebrities` (public route, M3 와 동일 통로).
- S2~S4 의 사용자 선택값: 본 sub-task 에서는 **BE 호출 없음**. spec.md §7.1 (web onboarding) 의 원칙 정합 — S7 최종 confirm 시점에 `POST /api/users/me/bio-profile` + `PATCH /api/users/me` 단일 호출로 묶음 (후속 sub-task).
- BFF denylist: `POST /api/persona-match` 등 PHI 노출 가능 endpoint 는 본 sub-task scope 외 (S6 도입 시점에 처리).

**진입 메커니즘 (임시)**: `ClaimsFeedScreen` 우상단의 "📋 프로필 입력하기" 링크. 후속 sub-task 에서 bio-profile 존재 여부 GET 으로 자동 진입 분기 도입 예정 (현재는 수동 진입만, dev convenience).

**구현 위치**:
- `apps/mobile/src/onboarding/{OnboardingFlow,PersonaSelectStep,BasicInfoStep,BodyMetricsStep}.tsx`
- types: `apps/mobile/src/onboarding/types.ts` (`PersonaDraft`, `BasicInfoDraft`, `BodyMetricsDraft`, `OnboardingDraftS2S4`)
- service: `apps/mobile/src/services/celebrities.ts` (`listCelebrities`)

**S5+ 후속에서 추가될 PHI 안전장치** (본 sub-task 범위 외):
- Health Disclaimer 노출 (`role="note"`)
- medical_conditions / medications / biomarkers 입력 컴포넌트 + SecureStore 임시 보관 (영속화 시)
- `POST /api/users/me/bio-profile` fail-closed 에러 처리 + 감사 로그 fail 시 5xx 그대로 반영

#### 7.1 Mobile onboarding S5–S7 (PHI + 최종 POST) *(PIVOT-MOBILE-2026-05, IMPL-MOBILE-M4-PHI-002)*

`apps/mobile` 의 온보딩 마법사 후반 3 단계 — Activity & Health / Goals & Diet / Reveal. **PHI 입력 + 단일 fail-closed POST**.

```
S4 Body Metrics (이전 sub-task 종료점)
        ↓
S5 Activity & Health  — ⚠ PHI 입력
  - 헤더 상단 Health Disclaimer (accessibilityRole='alert')
  - activity_level (ActivityLevel 5종 radio)
  - allergies (비-PHI, COMMON_ALLERGIES chip 다중 + free-text)
  - medical_conditions (⚠ PHI, free-text — comma-separated)
  - medications (⚠ PHI, free-text — comma-separated)
        ↓
S6 Goals & Diet  — 비-PHI
  - primary_goal (PrimaryGoal 8종 chip 단일)
  - secondary_goals (다중 chip, 선택)
  - diet_type (DietType 6종 chip 단일, 선택)
        ↓
S7 Reveal & Single POST  — 단일 fail-closed
  - 진입 즉시 `POST /api/users/me/bio-profile` 1회 호출 (saving phase)
  - 성공 → "설정 완료!" + "홈으로" CTA (onDone)
  - 실패 → 에러 메시지 + "다시 시도" / "이전 단계로"
```

**state 정책 (PHI 안전)**:
- 모든 step 의 draft 는 `OnboardingFlow` 컴포넌트의 **in-memory state 만** 사용. **AsyncStorage / SecureStore 절대 사용 X** — PHI (medical_conditions / medications) 가 디바이스 영속 저장소에 닿으면 분실/탈취 위험 + AES-256 적용 위치가 다층화되어 PHI 최소화 원칙 위반.
- 앱 닫기 / 백그라운드 / 다른 화면 전환 시 draft 유실은 의도된 trade-off — 재입력이 영속화보다 안전.

**BE 호출 정책**:
- S5 / S6 입력 시 **BE 호출 0회**. 모든 PHI 는 S7 진입 시점의 **단일 POST 로만 전송** (PHI 감사 로그도 단 1회 발생).
- 엔드포인트: BFF `POST /api/users/me/bio-profile` (M2 `authedFetch` 경유 — Bearer 토큰 자동 부착).
- body: `draftToBioProfileBody(draft)` 로 6 step 의 draft 를 `BioProfileCreateRequest` 형식으로 변환 (비-PHI + PHI + base 셀럽 slug).
- 5xx 또는 `AUDIT_LOG_FAILURE` 응답 시 **silent fallback 절대 X** — 사용자에게 에러 메시지 노출 + 재시도 버튼만 제공 (`.claude/rules/security.md` Fail-Closed 원칙 + spec §9.3 정합).

**PHI-Safe 에러 메시지 정책**:
- `RevealStep` 의 에러 상태에서 노출되는 메시지에 **사용자 입력값 (특히 PHI 필드) 절대 포함 X**.
- `ApiError instanceof` 분기 시 `err.status` 만 노출 (예: "저장에 실패했습니다 (500).").
- 네트워크 에러는 일반 문구 ("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.") 로만 안내.
- 로깅 (Sentry 등) 시점에도 draft 전체 dump 금지 — 본 sub-task 는 client 측 로깅 미구현이지만 후속 도입 시 동일 정책 적용 의무.

**Health Disclaimer**:
- S5 헤더 상단에 `accessibilityRole='alert'` 로 노출 (`.claude/rules/domain/content.md` Health Disclaimer 요구사항 충족).
- 문구: spec §10.4 Health Disclaimer 인용 ("본 입력값은 의료 자문이 아닙니다 ...").
- S6 / S7 에는 재노출하지 않음 — S5 진입 시점 1회로 충분.

**구현 위치**:
- `apps/mobile/src/onboarding/{ActivityHealthStep,GoalsStep,RevealStep,OnboardingFlow}.tsx`
- types: `apps/mobile/src/onboarding/types.ts` (`ActivityHealthDraft`, `GoalsDraft`, `OnboardingDraftComplete`)
- service: `apps/mobile/src/services/bio-profile.ts` (`draftToBioProfileBody`, `saveBioProfile`)

**진입 변경**: `App.tsx` 의 `onboarding_complete_placeholder` 안내 화면 제거 — S7 의 `onDone` 이 직접 `authenticated` 화면 (ClaimsFeedScreen) 으로 복귀시킨다.

### 7.2 Main App Flow

> **PIVOT-2026-05**: Tab 1 의 첫 화면은 "Wellness Claims Feed"다. 출처와 신뢰등급(trust_grade)이 표시된 셀럽 lifestyle claim 카드가 메인이고, 식단 처방(meal plan)은 claim → "Inspired Meal Plan" CTA 로 진입하는 보조 경로다.

```
[Tab 1: Discover — Wellness Claims Feed]
  ├── Category Tabs (food / workout / sleep / beauty / brand / philosophy / supplement)
  ├── ClaimCard Feed (cursor pagination, mixed celebrities)
  │     ├── Celebrity name + thumbnail
  │     ├── claim_type badge + trust_grade badge (A/B/C/D color-coded)
  │     ├── headline (plain text, max 280 chars)
  │     ├── body excerpt (optional)
  │     ├── primary source link (allowlist 도메인만, §9.3 #2)
  │     ├── disclaimer (trust_grade='D' 또는 is_health_claim=true 일 때 노출)
  │     └── "Inspired Meal Plan" CTA (base_diet_id 가 있을 때만, IMPL-020)
  ├── Celebrity Card → Celebrity Detail
  │     ├── Bio & Philosophy
  │     ├── Lifestyle Claims (claim_type 별 섹션)
  │     ├── Available Diets (legacy, secondary)
  │     └── "Try This Diet" CTA → Meal Plan Generation
  └── Search Bar (Celebrities, Claims by tag, Recipes)

# 데이터 노출 정책 (§9.3 #4): public 엔드포인트는 status='published' AND is_active=TRUE 만.
# draft / archived 는 admin moderation queue (IMPL-021) 에서만 노출된다.

[Tab 2: My Plan]
  ├── Active Meal Plan Overview
  │     ├── Today's Meals (expandable cards)
  │     ├── Weekly Calendar View
  │     └── Nutrition Summary (daily/weekly)
  ├── Recipe Detail → Step-by-step cooking view
  ├── "Order Ingredients" FAB → Cart Preview → Instacart Checkout
  └── Plan History

[Tab 3: Track]
  ├── Daily Check-in (meals completed, weight, energy, mood)
  ├── Progress Charts (weight, adherence, nutrition trends)
  └── Weekly/Monthly Reports

[Tab 4: Profile]
  ├── Bio Profile Management
  ├── Subscription Management
  ├── Order History
  ├── Settings (notifications, units, locale)
  └── Support / FAQ
```

#### 7.2 Mobile claims feed read path *(PIVOT-MOBILE-2026-05, IMPL-MOBILE-M3-CLAIMS-001)*

`apps/mobile` 의 Tab 1 Discover 첫 구현 — Wellness Claims Feed + Claim Detail 두 화면.

```
[Cold start auto-login (M2)] → ClaimsFeedScreen
                                 ├── CategoryTabs ('all' + ClaimType 7종 chip 가로 스크롤)
                                 ├── FlatList<ClaimCard>  (cursor pagination)
                                 │     onPress → ClaimDetailScreen
                                 ├── Empty state ("아직 등록된 claim 이 없습니다.")
                                 └── Error state (재시도 버튼)

ClaimDetailScreen
  ├── ← 뒤로 (App.tsx screen state 'authenticated' 복귀)
  ├── ClaimCard (detail-header variant — onPress 없음)
  ├── body (full text)
  ├── 출처 목록 — TouchableOpacity per ClaimSourceWire
  │     • isAllowedSourceUrl(source.url) true → Linking.openURL
  │     • false → "출처 링크 검증 실패" 표기 + Link role 미부착
  ├── disclaimer — `trust_grade === 'D' || is_health_claim` 시 노출
  └── "이 셀럽처럼 먹어보기" CTA — `base_diet_id != null` 시 노출, M5 미완으로 회색 비활성
```

**구현 위치**:
- `apps/mobile/src/screens/{ClaimsFeedScreen,ClaimDetailScreen}.tsx`
- 컴포넌트: `src/components/{ClaimCard,CategoryTabs,TrustGradeBadge}.tsx`
- service: `src/services/claims.ts` (`listClaims`, `getClaim`)
- URL allowlist guard: `src/lib/url-allowlist.ts` — `scripts/validate-claim-seeds.py` 의 `ALLOWED_DOMAINS` 13개와 정합 (vogue.com, elle.com, harpersbazaar.com, womenshealthmag.com, allure.com, people.com, instyle.com, glamour.com, nytimes.com, instagram.com, youtube.com, tiktok.com, x.com).

**API 통로**: BFF `GET /api/claims/feed`, `GET /api/claims/:id` 경유 — content-service 직접 호출 X (PIVOT-MOBILE 의 BFF active gateway 정합). 두 BFF route 모두 `createPublicRoute` 라 mobile 의 `authedFetch` 가 Bearer 없이 호출 가능 — 토큰 있으면 자동 부착 (향후 personalize hook 호환).

**Navigation**: 현재 `App.tsx` 의 `useState<Screen>` 단순 분기에 `'claim_detail'` 한 줄 추가 + `selectedClaimId: string | null` state. react-navigation 도입은 M4 onboarding 또는 M5 paywall 에서 detail screen 1+개 더 생기는 시점으로 미룸.

**M3 범위 외 (fast-follow)**:
- 카드에 셀럽 이름 + thumbnail — BFF `/api/celebrities/by-id/:id` route 신규 후 (IMPL-MOBILE-M3-CELEB-002)
- 검색바 (셀럽/태그 검색)
- "이 셀럽처럼 먹어보기" 활성화 — M5 IAP + Inspired plan 완성 후

#### 7.2 Mobile M5 tab navigation *(PIVOT-MOBILE-2026-05, IMPL-MOBILE-M5-NAV-001)*

M5 paywall scaffold 와 동반된 react-navigation 도입. `App.tsx` 의 `useState<Screen>` 분기 → RootStack + nested stacks 구조로 전환. Web spec 의 4-tab 구조 (Discover / My Plan / Track / Profile) 와 다르게 mobile 은 **Discover / Plan / Profile / Settings** 4 탭 — Track 은 M5+ 로 deferred, Settings 는 Apple Guideline 5.1.1(v) (sign out + account deletion) 충족용으로 분리.

```
RootStack (NavigationContainer)
  ├── Auth (cold start: bootstrapSession 미발견 시) — Login / Signup
  ├── Main (인증 완료 시) — BottomTabs (4 tabs)
  │     ├── Discover  (🔍) — ClaimsFeed → ClaimDetail / CelebrityDetail
  │     ├── Plan      (🥗) — MealPlanScreen (loaded / empty / error / loading)
  │     ├── Profile   (👤) — ProfileScreen (avatar + tier badge + Upgrade card)
  │     └── Settings  (⚙️) — SettingsScreen (Account · Subscription · Legal · Sign out)
  ├── Onboarding  [modal, presentation: 'modal']
  └── Paywall     [modal, presentation: 'modal']
```

**구현 위치**:
- Navigation: `apps/mobile/src/navigation/{RootNavigator,AuthNavigator,MainTabsNavigator,DiscoverNavigator,PlanNavigator,ProfileNavigator,SettingsNavigator,types}.tsx`
- Screens 신규: `apps/mobile/src/screens/{SettingsScreen,ProfileScreen,CelebrityDetailScreen,MealPlanScreen}.tsx`
- Services: `apps/mobile/src/services/{users,meal-plans}.ts` + `celebrities.ts` 확장 (`getCelebrity`, `listCelebrityClaims`)
- App.tsx: 192 → 22 lines (SafeAreaProvider + RootNavigator wrapper)

**Modal navigation 패턴**: tab 내부 stack 에서 root-level modal (Onboarding/Paywall) 진입 시 `useNavigation<NativeStackNavigationProp<RootStackParamList>>()` 로 root nav 객체를 직접 잡는다. `navigation.getParent()` 체이닝은 TS strict (`Object is possibly undefined`) + lint (`no-unnecessary-condition`) 양쪽에 걸리므로 회피.

**Tier-aware lock**: `ClaimsFeedScreen` + `CelebrityDetailScreen` 의 ClaimCard 는 `isClaimLocked(trust_grade, tier)` 가 true 면 onPress → `rootNav.navigate('Paywall')` 로 전환. trust A/B + free tier 가 lock 조합 (decisions.test.ts 에서 invariant 박음).

**Settings 화면 의무 항목 (Apple Guideline 5.1.1(v))**:
- Sign out — `signalLogout('expired_or_missing')` 후 RootNavigator 가 Auth phase 로 자동 전환
- Delete account — 확인 prompt + "submitted within 7 days" placeholder (BE endpoint 미존재, 후속 chore)
- Manage subscription — Apple `itms-apps://apps.apple.com/account/subscriptions` deep link

**Workflow 개선 (본 PR 동반)**:
- testID 마이그레이션: 라벨 변경에 회복 탄력적인 셀렉터. `login-email`, `login-submit`, `claims-upgrade`, `settings-delete-account`, `profile-upgrade` 등.
- Decision-as-test (`__tests__/decisions.test.ts`): pricing $34.99/mo · trust A/B + free=lock · en-US locale · Imperial 단위 invariant 를 코드로 박음. 실수로 변경 시 빨간불 + memory 문서 링크가 commit 에 남도록.

**M5 범위 외 (출시 전 필수, deferred)**:
- RevenueCat live API key 주입 + sandbox 결제 검증 (현재 PaywallScreen 은 DEV mock 만)
- Apple App Privacy / Google Play Data Safety mapping (M0.5 deferred 항목)
- Account deletion BE endpoint (`DELETE /api/users/me` 또는 service-driven workflow)
- Profile avatar fetch 는 본 PR 에서 `Image` 컴포넌트로 wiring (avatar_url null fallback = initial placeholder). 실 업로드/CDN 흐름은 후속.

### 7.3 Meal Plan Generation Flow (Detail)

```
User selects celebrity diet
        ↓
[Loading: "Personalizing {celebrity}'s diet for you..."]
        ↓
    System:
    1. Fetch user's bio_profile
    2. Fetch base_diet + recipes
    3. Send to AI Engine (SQS)
    4. AI Engine processes (5–15 sec)
    5. Result stored in meal_plans table
        ↓
[Meal Plan Preview]
  ├── Day-by-day meal overview
  ├── Key adjustments highlighted
  │   ("Boosted protein by 30g for your activity level")
  │   ("Substituted dairy with oat-based alternatives")
  ├── Total weekly nutrition breakdown
  └── "Confirm Plan" / "Adjust & Regenerate"
        ↓
[Plan Confirmed → "My Plan" tab activated]
```

---

## 8. Subscription Tiers

| Feature | Free | Premium ($14.99/mo) | Elite ($29.99/mo) |
|---------|------|--------------------|--------------------|
| Celebrity browsing | ✅ | ✅ | ✅ |
| Base diet viewing | 3 per month | Unlimited | Unlimited |
| AI personalized plans | ❌ | 4 per month | Unlimited |
| Instacart integration | ❌ | ✅ | ✅ |
| Biomarker analysis | ❌ | Basic | Advanced |
| Daily tracking | Basic | Full | Full + AI insights |
| Exclusive celebrity content | ❌ | ❌ | ✅ |
| Priority support | ❌ | ❌ | ✅ |

---

## 9. Non-Functional Requirements

### 9.1 Performance

| Metric | Target |
|--------|--------|
| API p50 latency | < 100ms |
| API p99 latency | < 500ms |
| Meal plan generation (Pass 1 초안) | < 3 seconds |
| Meal plan generation (Pass 2 최종) | < 15 seconds |
| App cold start (mobile) | < 2 seconds |
| Image load (CDN) | < 300ms |
| Instacart cart creation | < 1.5 seconds (배치 처리 + 캐시) |
| Monthly stats query (materialized view) | < 30ms |

### 9.2 Scalability

- 초기 목표: 50K MAU
- 설계 기준: 500K MAU까지 수평 확장 가능
- Auto-scaling: ECS Fargate (서비스별 독립 스케일링)
- DB: Read replicas (최소 2개), Connection pooling (PgBouncer)

### 9.3 Security

- 건강 데이터 보호 수준: 사용자의 바이오마커, 의료 이력, 약물 정보 등 PHI(보호건강정보)를 저장하며, **최소화 원칙(Minimum Necessary)**, **필드 수준 암호화**, **접근 감사 로그(phi_access_logs)** 를 적용한다. HIPAA 완전 준수 인증은 Phase 3 목표이며, Phase 1부터 HIPAA 요구사항에 부합하는 기술적 통제를 적용한다. (상세: CLAUDE.md § 2.2)
- TLS 1.3 in transit (전 구간)
- SOC 2 Type II 준비 설계
- OWASP Top 10 방어
- Rate limiting: API 1000회/시간 (유저당). user-service `/auth/*` per-route limits 는 아래 "user-service `/auth/*` Rate Limits" subsection 의 단일 출처를 따른다.
- URL allowlist 강제: 사용자 입력에서 외부 URL 수용 금지 (CLAUDE.md § 2.1)
- Semgrep 정적 분석: CI 파이프라인 필수 (CLAUDE.md § 14 DoD)

#### Claim 도메인 안전/법적 7원칙 *(PIVOT-2026-05, §3.5 single source of truth)*

§3.5 LifestyleClaim 도메인은 사용자가 직접 보는 출처 인용 + 셀럽의 발언 인용 + 건강 관련 주장이 섞인 영역이다. 아래 7원칙은 DDL·Zod·repository·BFF·FE 렌더가 모두 따라야 하는 **단일 출처**다. 위반 시 PR/PR 후 머지 차단.

1. **HTML sanitization**: `lifestyle_claims.headline`, `body`, `claim_sources.excerpt` 는 plain text only. BE 저장 전 strip_tags 적용. Zod 측에서 `<` 문자 포함 입력 reject. FE 렌더는 text node 만 — `innerHTML` / `dangerouslySetInnerHTML` 사용 금지.
2. **URL allowlist (SSRF 차단)**: `claim_sources.url`, `lifestyle_claims.primary_source_url` 은 허용 도메인 allowlist 내에서만 유효. 서버는 사용자/운영자 입력 URL 에 직접 HTTP 요청을 보내지 않는다 (CLAUDE.md Absolute Rule 7 직접 적용). 초기 allowlist: `vogue.com, elle.com, harpersbazaar.com, womenshealthmag.com, allure.com, people.com, instyle.com, glamour.com, nytimes.com, instagram.com, youtube.com, tiktok.com, x.com`. 확장은 PR 로 명시적 승인.
3. **soft delete 전파**: `celebrities.is_active=false` 또는 `deleted_at IS NOT NULL` 이 되면 해당 셀럽의 모든 published claim 은 즉시 `archived` 로 전환한다. 모든 서빙 쿼리는 `JOIN celebrities c ON c.id = lc.celebrity_id AND c.is_active = TRUE` 조건 필수 — FK ON DELETE RESTRICT 만으로는 부족하다. IMPL-021 admin moderation queue 에서 deactivate 시 일괄 archived 트랜잭션 처리.
4. **draft 미노출**: public claim 엔드포인트 (BFF `/api/celebrities/[slug]/claims`, `/api/claims/feed`, `/api/claims/[id]`) 는 `status='published' AND is_active=TRUE` 조건 필수. admin/moderation 라우트만 `draft` / `archived` 조회 허용.
5. **trust_grade published gate**: `trust_grade='E'` 는 published 전환 금지 (DB CHECK constraint `trust_grade_published_gate`). `trust_grade='D'` 는 published 가능하되 `disclaimer_key NOT NULL` 필수. 운영자 UI 는 D 등급 publish 시 disclaimer 선택을 강제한다.
6. **`is_health_claim` 설정 주체**: DB default `FALSE`. Phase 0~1 에서는 seed JSON 작성 시 human (IMPL-019 owner) 이 명시적 지정 + IMPL-021 admin moderation queue 에서 toggle. Phase 2+ 자동 분류기 도입은 별도 검토. **published 전 BE re-validate 필수** — FE 가 이 플래그로 disclaimer 표시 여부를 결정하므로 신뢰 가능해야 한다.
7. **seed-validator 는 allowlist-only**: CI 에서 실행되는 seed 검증기는 **URL 형식(regex) + 도메인 allowlist 매칭만** 수행. HTTP 요청 (GET/HEAD 포함) 금지 — 원칙 #2 와 동일한 SSRF 차단. URL 404 감지는 외부 batch job 으로 분리 (Phase 1+, 외부 큐에서 비동기 실행, 사용자 입력 경로 외부).

**PHI 자산별 암호화 정책 매트릭스:**

| 자산 | 저장 위치 | At-Rest 암호화 | 접근 통제 | 보존 기간 | 삭제 방식 |
|------|----------|---------------|----------|----------|----------|
| `bio_profiles.biomarkers` | PostgreSQL | App-level AES-256-GCM (키: AWS KMS) | phi_minimizer 필터링 + 감사 로그 | 계정 활성 기간 + 30일 | 키 폐기 → 30일 후 hard delete |
| `bio_profiles.medical_conditions` | PostgreSQL | App-level AES-256-GCM | 감사 로그 필수 | 상동 | 상동 |
| `bio_profiles.medications` | PostgreSQL | App-level AES-256-GCM | 감사 로그 필수 | 상동 | 상동 |
| `users.email` | PostgreSQL | App-level AES-256-GCM | 서비스 간 접근 시 user-service API 경유 | 계정 활성 기간 + 30일 | hard delete |
| 바이오마커 OCR 원본 파일 | S3 `celebbase-phi/` | SSE-KMS (AWS managed key) | IAM policy: meal-plan-engine + admin만 | 90일 (S3 Lifecycle) | S3 삭제 + 버전 삭제 |
| `phi_access_logs` | PostgreSQL | RDS 기본 암호화 (AES-256) | 읽기: 보안팀 + 감사팀만 | 6년 (HIPAA) | 보존 기간 후 배치 삭제 |
| `daily_logs` (체중, 무드 등) | PostgreSQL | RDS 기본 암호화 | 일반 접근 (PHI 급은 아님) | 계정 활성 기간 + 30일 | hard delete |
| Redis 캐시 (식단 데이터) | ElastiCache | In-transit + at-rest 암호화 | VPC 내부 접근만 | TTL 기반 자동 만료 | 자동 |

> **키 관리**: 모든 App-level 암호화 키는 AWS KMS에서 관리. 키 로테이션 연 1회 자동. 계정 삭제 시 해당 사용자 전용 DEK(Data Encryption Key)를 즉시 폐기하여 데이터 접근을 불가능하게 한다.

#### BFF Authentication — hybrid cookie + Bearer *(PIVOT-MOBILE-2026-05, IMPL-MOBILE-BFF-001)*

`apps/web/src/app/api/**` 의 BFF 는 web (cookie) + mobile (`Authorization: Bearer`) 두 클라이언트를 동시에 서빙한다. `createProtectedRoute` 의 분기 규칙은 **단일 출처** — 위반 시 PR 머지 차단.

1. **Path A — cookie 우선, fallthrough 금지**: `cb_access` cookie 가 존재하면 cookie path 만 시도한다. cookie 검증 실패(JWTExpired·refresh 실패·forged) 시 `Authorization` 헤더를 검사하지 않는다. cookie 가 부재할 때만 Bearer path 진입. 이로써 web 세션 down-grade 공격(쿠키 만료 시 공격자가 Bearer 헤더 주입으로 우회) 차단.
2. **Cookie path**: 기존 web 동작 유지 — JWTExpired 시 user-service `/auth/refresh` silent 호출 + 성공 시 `setSessionCookies`, 실패 시 `clearSessionCookies` + 401. 응답에 `Set-Cookie` 발행.
3. **Bearer path (mobile 전용)**: `^Bearer (.+)$` (RFC 6750 case-sensitive) 매칭. 검증 성공 시 handler 실행, 검증 실패 시 401. Bearer path 는 **silent refresh 미수행**(token rotation 은 mobile 클라이언트가 user-service `/auth/refresh` 직접 호출), **`Set-Cookie`/`clearSessionCookies` 미발행**(server-driven cookie state 가 mobile 의 SecureStore 와 충돌 방지). JWTExpired 는 `X-Token-Expired: 1` 헤더 + 401, forged 는 단순 401.
4. **Session.authSource 필수 필드**: `session: { user_id, email, cognito_sub, authSource: 'cookie' | 'bearer' }`. handler 가 분기 동작(예: PHI 감사 로그 source tagging, audit metric)을 결정할 수 있도록 caller-side 가시성 보장. `verifyAccessToken` 자체는 source-agnostic 하게 `Omit<Session, 'authSource'>` 반환 — caller (cookie / bearer 분기) 가 spread 로 주입.
5. **Timing oracle 차단**: cookie 분기·bearer 분기·검증 성공/실패 모든 exit 가 `padToMinLatency(handlerStart)` (100ms anchor) 를 통과한다. 공격자가 응답 시간 차이로 cookie/bearer 존재·검증 결과를 구분하는 oracle 차단.
6. **`/auth/refresh` 예외**: BFF 의 `/api/auth/refresh` 는 cookie-shaped(JSON 토큰 미반환) 이므로 mobile 은 user-service `/auth/refresh` 를 BFF 우회 직접 호출한다. 모든 다른 mobile path 는 BFF 경유 (path confusion 회피).

#### user-service `/auth/*` Rate Limits *(PIVOT-MOBILE-2026-05, IMPL-MOBILE-AUTH-002b)*

`services/user-service/src/routes/auth.routes.ts` 의 per-route rate-limit 한도. mobile-pivot baseline — 모바일 SRP 흐름의 짧은 burst 와 background refresh 빈도를 흡수하면서 brute-force / abuse 는 차단한다. 모두 `@fastify/rate-limit` v10 사용, `NODE_ENV=test` 에서는 `allowList` 콜백으로 bypass.

| Route | max / min | bucket key | 근거 |
|-------|-----------|-----------|------|
| `POST /auth/signup` | **3** | per-IP | NAT 환경 인간 trigger only — 봇/스크립트 차단 효과 유지 |
| `POST /auth/login` | **10** | per-IP | 5→10 상향. 모바일 SRP 의 initiate + PASSWORD_VERIFIER + 재시도 (오타) headroom. NAT 뒤 동시 사용자 4-5명 허용. brute-force 효율은 5와 10 사이 유의미 차이 없음 (Cognito SRP server-cost 비대칭) |
| `POST /auth/refresh` | **30** | sha256(refresh_token) + IP | 20→30 상향. 모바일 access token TTL 5분 → 분당 1회 정상 + background → foreground race + 다중 in-flight retry burst. token-fingerprint 키 라 NAT 영향 없음 (다른 사용자 distinct token) |
| `POST /auth/logout` | **20** | per-IP | 신규 추가 (DECISION §3.4). 기존 한도 0 → 무한 polling 회귀 차단. JWT verify 가 limiter 후 실행이라 token 키 사용 위험 (per-IP 만 안전) |

**환경 변수 override**: `AUTH_RATE_LIMIT_SIGNUP / LOGIN / REFRESH / LOGOUT` 4종 (default = 위 표 수치). `services/user-service/src/env.ts` `EnvSchema` 가 `z.coerce.number().int().min(1).max(1000)` 로 검증. 운영 환경에서 redeploy 없이 retune 가능 (예: 트래픽 spike 시 login 임시 상향).

**불변식**:
- rate-limit 429 와 `auth.token.reuse_detected` 는 **독립 메커니즘** — 통과 후에도 reuse_detection 발화 가능, 그 반대도 가능.
- logout 라우트의 limiter 는 JWT verify 보다 먼저 실행 — token 정보 누설 방지를 위해 key 는 per-IP 로 한정. **구현 메커니즘**: `/auth/logout` 은 `registerJwtAuth` 의 `publicPaths` 목록에 포함되어 root-scope 외부 JWT onRequest hook 을 우회한다. 라우트 핸들러가 limiter 통과 후 `verifyInternalRefresh(body.refresh_token)` 으로 직접 검증하고 `userId = verified.sub` 로 도출 (Bearer access token 별도 불필요 — `/auth/refresh` 와 동일 모델). 이 순서가 깨지면 (e.g. /auth/logout 을 publicPaths 에서 빼면) 잘못된 토큰 spam 이 limiter bucket 에 카운트되지 않아 invalid-token DoS 방어가 무력화된다.
- `NODE_ENV=test` allowList bypass 는 통합 테스트 회귀 보호 — production 에서는 절대 적용되지 않음.

##### Per-route limiter ordering — 두 패턴 *(CHORE-AUTH-PUBLIC-PATHS-AUDIT)*

신규 per-route rate-limit 도입 시 다음 두 패턴 중 하나로 명시 분류한다 (PR description 또는 라우트 주석). 혼용 금지 — 잘못된 패턴 선택은 DoS 방어 무력화 (logout-style 미적용) 또는 정상 사용자 분리 손실 (ws-ticket-style 미적용) 를 유발한다.

| Pattern | 적용 조건 | 구현 |
|---------|----------|------|
| **A — limiter-first** (logout-style) | invalid-token spam 자체가 BE cost (signature verify, JWKS round-trip, audit log emit 등) → invalid-token DoS 방어 필수. token 자체가 인증 매개체인 경우 (refresh_token, signup, login, logout) | (1) 라우트를 `publicPaths` 에 추가 → root-scope JWT 가드 skip. (2) 라우트 핸들러에서 직접 token verify (limiter 통과 후). (3) limiter bucket key = **per-IP only** (token 정보 포함 시 enumeration 가능). 예: `/auth/{signup,login,refresh,logout}` |
| **B — auth-first** (ws-ticket-style) | 인증된 사용자만 호출 가능 (token = user identity, abuse 패턴이 user 행동) | (1) 라우트를 `publicPaths` 에 **포함하지 않음** → root-scope JWT 먼저 실행. (2) 라우트 핸들러는 `request.userId` (middleware-set) 의존. (3) limiter `keyGenerator: (request) => request.userId` — per-user-id bucket 분리. 예: `/ws/ticket` (분당 10회 per user) |

결정 트리: (1) "이 라우트는 인증된 사용자만 호출하는가?" — No → Pattern A. Yes → (2) "invalid token spam 이 의미 있는 BE cost?" — Yes → Pattern A, No → Pattern B. 자세한 audit 결과는 `pipeline/runs/CHORE-AUTH-PUBLIC-PATHS-AUDIT/audit-report.md` 참조 — 2026-05-07 시점 commerce/content/analytics/meal-plan-engine 모두 per-route limiter 부재로 ordering bug 0건.

#### Refresh Token Reason Codes — `/auth/refresh` 401 envelope *(PIVOT-MOBILE-2026-05, IMPL-MOBILE-AUTH-003)*

`POST /auth/refresh` (user-service) 는 401 응답의 `error.code` 를 다음 5종 enum 으로 분기한다 — mobile 클라이언트의 refresh 상태머신 source of truth. **BFF forward 보장 (CHORE-BFF-401-CONTRACT)**: `apps/web/src/app/api/_lib/bff-fetch.ts` 가 upstream 401 을 일반 status 처럼 `Result<T>.ok=false + upstream code` 로 반환한다 (이전 `SessionExpiredError` throw → `'TOKEN_EXPIRED'` 통일 동작은 폐기). 따라서 `POST /api/auth/refresh` 뿐 아니라 `POST /api/auth/mobile/{signup,login}` + 모든 protected BFF route 가 user-service envelope code 를 그대로 forward 한다 — mobile 의 5종 enum 분기와 web 클라이언트의 enum-aware 로직이 동일 source 를 본다.

| `error.code` | 발생 조건 | 클라이언트 권장 행동 |
|--------------|----------|---------------------|
| `REFRESH_EXPIRED_OR_MISSING` | (a) refresh JWT 가 jose `JWTExpired` 로 만료, 또는 (b) DB `refresh_tokens` row 부재 / `expires_at <= now()` | mobile: Cognito `Auth.currentSession()` 으로 silent re-issue 시도 후 실패 시 재로그인. web: 재로그인 redirect. |
| `TOKEN_REUSE_DETECTED` | revoked 상태 (`revoked_reason in ('rotated','reuse_detected')`) 의 jti 가 다시 제시됨. 서버는 동일 트랜잭션에서 `revokeAllByUser(reason='reuse_detected')` 호출 + audit log emit (emit-before-throw 보장) | mobile: Cognito fallback **금지** (재인증으로도 신뢰 회복 불가) → SecureStore clear + 즉시 강제 logout + 사용자에게 보안 사유 안내. web: cookie clear + login redirect. |
| `REFRESH_REVOKED` | revoked 상태 (`revoked_reason = 'logout'`). 사용자가 명시적으로 logout 한 토큰 재사용 | 즉시 강제 logout. 메시지 노출 불필요. |
| `MALFORMED` | (a) JWT signature 위조 / format 오류 / issuer mismatch, (b) `token_use !== 'refresh'`, (c) `sub` / `jti` claim 누락, (d) JWT 의 sub 가 `users` 테이블에 부재 | 즉시 강제 logout + 디버그 로그. 정상 사용자에게 발생할 수 없음. |
| `ACCOUNT_DELETED` | `users.deleted_at IS NOT NULL`. 트랜잭션 내부에서 `findByIdInTx` 로 조회 — 동시 `DELETE /users/me` race 차단 | 영구 로그아웃 + "계정이 삭제되었습니다" 안내. 복구 요청은 별도 channel. |

**불변식**:
- 5종 모두 HTTP status 401 + AppError 서브클래스 (`packages/service-core/src/errors.ts`) — Fastify `setErrorHandler` 가 envelope 으로 직렬화.
- Internal HTTP error (`'Internal error: new jti missing'`) 는 본 enum 외 — 서버 버그 시그널, mobile 클라이언트는 일반 401 로 처리하고 backlog 추적.
- JWT verify 단계 catch 는 `joseErrors.JWTExpired` instanceof 로 `REFRESH_EXPIRED_OR_MISSING` 분기, 그 외 모든 verify 실패 → `MALFORMED`. signature 위조와 format 오류는 클라이언트 입장에서 동일 거동 (강제 logout) 이라 통합한다.
- `revokeAllByUser` 는 `TOKEN_REUSE_DETECTED` 분기에서 throw 이전에 `await` 완료 — fail-closed 보장 (CLAUDE.md Absolute Rule 5 정합).
- ACCOUNT_DELETED 게이트는 `performRotation` 트랜잭션 첫 액션 — `client.query('BEGIN')` 직후. signup/login 은 별도 entry point 로 본 enum 의 적용 범위 외 (login 자체 deletion 분기는 §4.2 login 라우트의 `'Account has been deleted'` 응답을 그대로 유지).

### 9.4 Availability

- SLA: 99.9% uptime
- Multi-AZ 배포 (us-west-2)
- RTO: 1시간, RPO: 5분
- 자동 장애 감지 및 알림 (PagerDuty)

### 9.5 Observability

- Structured logging: JSON format, correlation ID 전파
- Distributed tracing: OpenTelemetry → Datadog APM
- Custom metrics: meal plan generation time, Instacart API success rate, onboarding funnel conversion
- Alerts: Error rate > 1%, p99 > 2s, Instacart API failure > 5%

---

## 9A. Evaluator Rubric (PGE 채점 기준)

Generator가 제출한 코드를 Evaluator가 검증할 때 사용하는 정량적 기준이다.

### 기능 정확성

| Criteria | Pass | Fail |
|----------|------|------|
| 영양소 계산 정확도 | USDA 기준 대비 오차 ±5% 이내 | ±5% 초과 |
| 이종 소스 교차 검증 | USDA ↔ Instacart 동일 재료 단백질 편차 ±5% 이내 | ±5% 초과 또는 단위 변환 누락 |
| 미량영양소 단위 일관성 | 모든 레시피에서 IU/µg/mg 단위 정규화 완료 | 단위 혼재 상태로 계산 |
| 알레르겐 필터링 | 알레르기 사용자에게 알레르겐 포함 레시피 0건 | 1건이라도 노출 |
| 칼로리 안전 하한선 | 생성된 식단 ≥ 1200kcal/일 (예외 없음) | 1200kcal 미만 결과 생성 |
| 7일 식단 다양성 | 동일 레시피 최대 2회, 연속 동일 주재료 없음 | 3회 이상 반복 |
| 매크로 밸런스 | 단백질/탄수화물/지방 합산 = 총 칼로리 ±3% | ±3% 초과 불일치 |
| PHI 최소화 | AI 파이프라인 각 단계에 필요 필드만 전달 | 불필요한 건강 데이터 전달 |

### 성능

| Criteria | Pass | Fail |
|----------|------|------|
| API p50 응답 시간 | < 100ms | ≥ 100ms |
| API p99 응답 시간 | < 500ms | ≥ 500ms |
| 식단 생성 Pass 1 (초안) | < 3초 | ≥ 3초 |
| 식단 생성 Pass 2 (최종) | < 15초 | ≥ 15초 |
| Instacart 장바구니 생성 | < 1.5초 (배치) | ≥ 1.5초 |
| DB 쿼리 (단일) | < 50ms | ≥ 50ms |
| 월간 통계 조회 (materialized view) | < 30ms | ≥ 30ms |

### 보안

| Criteria | Pass | Fail |
|----------|------|------|
| 하드코딩된 시크릿 | 0건 (코드 내 어디에도 없음) | 1건이라도 발견 |
| SQL injection 취약점 | parameterized query 100% | raw string concat 발견 |
| 인증 우회 | 보호 엔드포인트 인증 없이 접근 불가 | 미인증 접근 가능 |
| 입력 검증 누락 | 모든 API input에 Zod/Pydantic 적용 | 미검증 input 존재 |
| Semgrep 스캔 | critical 0건, high 0건 | 1건이라도 발견 |
| 사용자 입력 URL 수용 | 0건 | query param/body에서 URL 받아 서버 접속 |
| PHI 접근 감사 로그 | 건강 데이터 접근 시 `phi_access_logs` 기록 | 기록 누락 |

### 코드 품질

| Criteria | Pass | Fail |
|----------|------|------|
| TypeScript `any` 사용 | 0건 | 1건 이상 |
| ESLint / ruff 경고 | 0건 | 1건 이상 |
| 테스트 커버리지 (신규 코드) | ≥ 80% | < 80% |
| 전체 테스트 통과율 | 100% | < 100% |
| PGE 루프 횟수 | ≤ 3회 내 통과 | 3회 초과 (에스컬레이션 필요) |

---

## 10. Development Phases

### Phase 1: MVP (Week 1–8)

**Goal**: 핵심 가치 검증 — 셀럽 식단 선택 → 개인화 → 레시피 제공

- [ ] Auth (Cognito + Apple/Google SSO) — CognitoAuthProvider 백엔드 빌드 완료(IMPL-010-d), 실 활성화는 CHORE-006 대기 (현재 AUTH_PROVIDER=dev)
- [x] Onboarding survey (bio profile) — GET/POST/PATCH/DELETE /users/me/bio-profile 구현 (IMPL-002), PHI 감사 로그 포함
- [x] Celebrity & base diet CRUD + seed data (10 celebrities) — content-service API (IMPL-003) + 10 celebrities 시드 180 recipes (IMPL-009)
- [x] AI personalization engine v1 (calorie + macro + allergen) — 7개 AI 모듈 + pipeline.py 오케스트레이터 (IMPL-004-a/b/c), Quota Enforcement (IMPL-013)
- [x] Personalized meal plan generation & display — SQS 비동기 생성 + WebSocket 상태 push + docker-compose LocalStack (IMPL-014-a/b/c, IMPL-015)
- [x] Recipe detail view — GET /recipes/:id + personalized endpoint (IMPL-003)
- [x] Basic daily tracking — POST/GET /users/me/daily-logs + summary (IMPL-007)
- [x] Subscription (Stripe) — Premium tier only — Checkout Session + Webhook + syncTierTransaction (IMPL-012)
- [ ] Mobile app (iOS priority) + Web landing page — FE 세션에서 진행 중 (IMPL-APP-001 시리즈)

### Phase 2: Commerce & Engagement (Week 9–14)

- [ ] Instacart Connect integration
- [ ] Cart preview & one-click checkout
- [ ] Push notifications (meal reminders, plan completion)
- [ ] Progress analytics & weekly reports
- [ ] Recipe search (Elasticsearch)
- [ ] Biomarker upload + OCR parsing
- [ ] Elite tier launch
- [ ] Android app
- [ ] Wearable integration v1 (Apple Health, Google Fit — 활동량/수면 자동 동기화)
- [ ] Content Service 이벤트 인터페이스 구현 (Phase 3 Trend Service 플러그인 준비)

### Phase 3: Growth & Intelligence (Week 15–20)

- [ ] **Trend Intelligence Service v1** — SNS 데이터 수집 + NLP 파이프라인 + 관리자 승인 워크플로우
- [ ] **Dynamic Base Layer** — 승인된 트렌드 → base_diet 자동 버전 업데이트 + 사용자 알림
- [ ] AI recipe recommendations (collaborative filtering)
- [ ] Social features (share meal plans, community)
- [ ] GLP-1 specialized program
- [ ] Wearable integration v2 (Oura Ring, CGM 연속혈당모니터 연동)
- [ ] A/B testing framework
- [ ] Referral program
- [ ] Amazon Fresh fallback integration
- [ ] Admin dashboard v2 (content management, trend curation, analytics)

### Phase 4 (Plan 22 Follow-up — Home Experience & Closed-Loop Automation)

Plan 22 (`/home` redesign — "Be the Celebrity" closed-loop) 구현 이후 잔여 future scope. Plan 22 Phase G 에서 stub 으로 확정됨 — 세부 설계는 차기 Plan(23+) 에서.

- [ ] **Native calendar sync**: iOS EventKit / Android CalendarProvider 로 식사 이벤트 push (`MealEventSyncAdapter`)
- [ ] **AI pantry reflection**: Plan 23 meal-plan-engine 에 `pantry` 주입 — skipped / excluded 재료 기반 다음 플랜 재료 재사용 optimization
- [ ] **Multi-celebrity blend**: 2 persona 가중 평균 식단 (`blend_weight` = [0.5, 0.5] 등) + alignment 점수 per-persona 분리 계산
- [ ] **Weekly recap email**: Alignment % + skipped 요약 자동 발송 (Day 5 WOW 이후 주간 재귀 자동화)
- [ ] **Live Instacart API**: IDP 계약 체결 후 `INSTACART_ADAPTER_MODE=live` 활성화 + 3-5% affiliate commission tracking (`instacart_orders.affiliate_revenue_usd`)
- [ ] **`ingredient_id` 정규화 테이블**: `ingredients` 마스터 + `canonical_unit` · density 환산 테이블 — Plan 22 D2 `normalize(name)+unit` 휴리스틱 대체 (Plan 23)
- [ ] **`pantry_entries` 테이블 분리**: `users.preferences.pantry` JSONB path → 관계형 테이블 (history / audit / TTL 개선)

---

## 11. Project Structure

> **PIVOT-MOBILE-2026-05 갱신 (BFF active gateway)**: active client 는 `apps/mobile` (Expo / RN). `apps/web` 의 SSR pages·components·route groups 는 frozen — 어느 owner 도 새 기능 추가 X. 단 **BFF (`apps/web/src/app/api/**`) 와 server lib (`apps/web/src/lib/server/**`) 는 모바일의 active gateway 로 살아 있다** — JUNWON 이 mobile-driven 신규 라우트를 추가한다 (`createProtectedRoute` cookie + Bearer hybrid, IMPL-MOBILE-BFF-001 / SUB-SYNC-002). owner 매핑은 `CLAUDE.md` §1.1, 세션 토폴로지는 `.claude/rules/multi-session.md` §1, hybrid auth 분기 규칙은 §9.3 의 "BFF Authentication — hybrid cookie + Bearer" 참조.

**`apps/mobile/` workspace scaffold (IMPL-MOBILE-WORKSPACE-001)**: Expo SDK 54 + React Native 0.81 + TypeScript blank scaffold. monorepo 통합은 `apps/mobile/metro.config.js` 가 `watchFolders: [workspaceRoot]` + `resolver.nodeModulesPaths: [project, workspaceRoot]` + `disableHierarchicalLookup: true` 로 pnpm hoist 패턴과 per-package node_modules 를 둘 다 검색한다.

`apps/mobile/package.json` scripts: `start` / `ios` / `android` / `web` (Expo dev server) + `typecheck` (`tsc --noEmit`) + `lint` (`eslint "**/*.{ts,tsx}"`) + `test` (placeholder — 동료 M0 에서 jest 셋업). `.env.example` 은 `EXPO_PUBLIC_BFF_BASE_URL` / `EXPO_PUBLIC_USER_SERVICE_URL` (`/auth/refresh` 직접 호출용 예외) / `EXPO_PUBLIC_COGNITO_*` / `EXPO_PUBLIC_REVENUECAT_*` 를 명시 — Expo 의 `EXPO_PUBLIC_` 접두사만 client bundle 에 포함된다 (그 외는 build-time 만).

ESLint `apps/mobile/**` override (CHORE-MOBILE-001 / PR #47) 가 `@celebbase/service-core` (Node.js 서버 전용) + `@celebbase/ui-kit` (react-dom + CSS Modules) import 를 IDE/CI 레벨로 차단. 2차 방어인 Metro `resolver.resolveRequest` throw 는 동료 M0 본격 작업에서 추가 예정.

**Mobile auth ingress 결정 (IMPL-MOBILE-AUTH-002, DECISION §9 Option B)**: mobile 은 user-service `/auth/*` 를 직접 호출하지 않고 BFF `POST /api/auth/mobile/{signup,login}` 라우트를 경유한다. 이 mobile 라우트는 `Set-Cookie` 를 절대 발급하지 않으며 `{user, access_token, refresh_token}` JSON body 를 직반환한다 — mobile 은 `expo-secure-store` 에 internal refresh JWT 를 저장한다. **유일 예외**: `/auth/refresh` 는 BFF cookie-shaped 라 mobile 이 user-service `/auth/refresh` 를 직접 호출 (§4.2 Auth & User 표 참조, IMPL-MOBILE-AUTH-003 의 5종 enum 결과를 그대로 수신). `/auth/logout` 도 현재 user-service 직접 호출 — mobile 전용 logout BFF 라우트 도입 여부는 SUB-SYNC-002 진행 시점에 재검토.

**BFF subscription sync route (IMPL-MOBILE-SUB-SYNC-002)**: mobile (M5 IAP 결제 직후) 또는 web (app foreground 시 entitlement 재확인) 이 `POST /api/subscriptions/sync` 를 호출한다. 이 BFF 라우트는 `createProtectedRoute` 로 cookie + Bearer 둘 다 인증 후 **새로 도입된 internal client** (`apps/web/src/app/api/_lib/internal-client.ts`) 로 commerce-service `/internal/subscriptions/refresh-from-revenuecat` 를 호출한다 — fetchBff (사용자 access token forward) 가 아닌 **service-to-service internal JWT** (audience = `commerce-service:internal`) 를 BFF 가 mint 하여 송신한다. 이는 user JWT 만으로 commerce internal endpoint 를 호출 가능하게 두면 모든 인증된 사용자가 본 endpoint 를 직접 호출하는 attack surface 가 생기기 때문 — internal endpoint 는 BFF 만 발급 가능한 audience 로 제한된다.

**T4 enforce (SUB-SYNC-001b adversarial)**: BFF `/api/subscriptions/sync` body 는 `{ source: 'purchase' | 'app_open' | 'manual' }` 만 받는다. `user_id` 는 client body 가 아닌 **인증된 session 의 `user_id`** (cookie/Bearer 검증 결과) 가 commerce 로 전달된다. 따라서 사용자 A 가 사용자 B 의 user_id 를 body 에 넣어도 BFF 가 무시 → A 자신의 entitlement 만 sync. zod `.strict()` 가 unknown key 를 400 VALIDATION_ERROR 로 거부하여 attempt 자체를 차단한다.

**BFF subscription sync 응답 schema 검증**: commerce 의 `SyncFromRevenuecatResult` 가 BFF 의 zod `ResponseSchema` (`{ user_id: UUID, tier, status, current_period_end: nullable, source }`) 와 정합하지 않으면 BFF 는 502 `UPSTREAM_SCHEMA_MISMATCH` 를 반환한다 — commerce 측 contract drift 가 mobile 까지 전파되는 것을 차단. 본 검증은 mobile state machine 이 의존하는 응답 shape 을 BFF 가 강제하는 첫 boundary.

**BFF subscription sync rate limit (CHORE-SUB-SYNC-RATE-LIMIT-001)**: `POST /api/subscriptions/sync` 는 `apps/web/src/app/api/_lib/route-rate-limit.ts` 의 token bucket 으로 **per-session.user_id 분당 5회** 제한된다. M5 IAP 정상 흐름은 결제당 1회 호출이라 5회 한도는 foreground/app_open 재확인 burst 까지 흡수 + 자동화 abuse (commerce → RevenueCat REST API quota 소진) 차단. 패턴 분류: §9.3 의 **Pattern B (auth-first)** — key = authenticated `session.user_id`, `createProtectedRoute` 가 unauth 를 401 로 차단하므로 invalid session 은 본 gate 도달 불가. 한도 초과 시 429 `RATE_LIMITED` envelope + `Retry-After: 60` 헤더. SUB-SYNC-002 의 adversarial T8 close.

**Staging deployment infrastructure (CHORE-MOBILE-STAGING-BFF-001)**: `apps/web` BFF 와 BE service `user-service` 가 staging EC2 (Elastic IP) 위에서 docker-compose 로 운영된다. **partial staging** — `content-service` / `commerce-service` / `meal-plan-engine` / `analytics-service` 는 별도 chore (CHORE-STAGING-BE-DEPLOY-001) 로 deferred. BFF 의 module-load `readEnv()` 는 5개 `*_SERVICE_URL` env 모두 필요하므로 deploy 되지 않은 서비스는 dummy URL (`http://disabled:0` 등) 로 채워두고, BFF 코드가 해당 BE 호출 시 DNS resolve 실패 → 502 `UPSTREAM_UNREACHABLE` 응답. public ingress 는 단일 hostname (`<STAGING_DOMAIN>`, Cloudflare DNS — Route53 가 free tier 제한으로 Cloudflare Registrar 채택) 에서 **Caddy** 가 TLS 종료 (Let's Encrypt HTTP-01 자동 발급/갱신, `caddy_data` named volume 으로 cert 영속화) + 두 layer 라우팅 수행:

- `/auth/refresh` → `user-service:3001` (spec §4.2 hybrid BFF 의 cookie-shaped 예외 경로 — mobile `auth-refresh.ts` 가 `EXPO_PUBLIC_USER_SERVICE_URL` 로 직접 호출)
- 그 외 모든 path (`/`, `/api/*`, …) → BFF (`web:3000`)

이렇게 하면 BE service ports (3001~3005) 의 public inbound 는 security group 으로 모두 차단된 상태에서 mobile 의 hybrid auth flow 가 그대로 동작한다. mobile `.env` 의 `EXPO_PUBLIC_BFF_BASE_URL` 과 `EXPO_PUBLIC_USER_SERVICE_URL` 은 staging 에서 동일하게 `https://<STAGING_DOMAIN>` 을 가리킨다.

CD (`.github/workflows/cd.yml`) 는 `main` push 시 user-service / web image 를 ECR 에 push (short-SHA tag + `staging-latest` 이중) 한 뒤 EC2 SSH 로 `docker compose pull` + `up -d --force-recreate` + **180s deadline healthcheck** (HTTPS endpoint probe — LE 발급 + Next cold start 여유) + 실패 시 이전 web image **digest** (`RepoDigests[0]`) 로 자동 rollback. tag-only rollback 은 새로 push 된 broken image 가 같은 tag 점유로 다시 pull 되는 무한 루프를 초래하므로 금지. `scripts/preflight-env.sh` 가 `/app/.env.staging` 의 12개 필수 key 존재 + `INTERNAL_JWT_SECRET` 의 user-service 컨테이너 runtime env 와의 SHA256 equality 를 deploy 전 검증 (mismatch 시 Bearer JWT silent 401 차단; raw secret 은 컨테이너 stdout 에서 즉시 hash 되어 외부 노출 없음). Caddy + Caddyfile fail-fast: `STAGING_DOMAIN` 미설정 시 docker compose 자체가 fail 하여 `localhost` 로 LE rate-limit 무한 루프를 차단한다.

```
celebbase-wellness/
├── apps/
│   ├── mobile/                     # React Native app
│   │   ├── src/
│   │   │   ├── screens/            # Screen components
│   │   │   │   ├── onboarding/
│   │   │   │   ├── discover/
│   │   │   │   ├── plan/
│   │   │   │   ├── track/
│   │   │   │   └── profile/
│   │   │   ├── components/         # Shared UI components
│   │   │   ├── navigation/         # React Navigation config
│   │   │   ├── hooks/              # Custom hooks
│   │   │   ├── services/           # API client layer
│   │   │   ├── stores/             # Zustand state management
│   │   │   ├── utils/
│   │   │   └── theme/              # Design tokens
│   │   ├── ios/
│   │   ├── android/
│   │   └── package.json
│   │
│   ├── web/                        # Next.js web app
│   │   ├── src/
│   │   │   ├── app/                # App Router pages
│   │   │   ├── components/
│   │   │   └── lib/
│   │   └── package.json
│   │
│   └── admin/                      # Internal admin dashboard
│       └── ...
│
├── services/
│   ├── api-gateway/                # Kong config
│   │
│   ├── user-service/               # Node.js (Fastify)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── models/
│   │   │   ├── validators/         # Zod schemas
│   │   │   └── middleware/
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── content-service/            # Node.js (Fastify) — celebrities, diets, recipes
│   │   └── ... (same structure)
│   │
│   ├── meal-plan-engine/           # Python (FastAPI) — AI core
│   │   ├── src/
│   │   │   ├── api/
│   │   │   ├── engine/
│   │   │   │   ├── calorie_adjuster.py
│   │   │   │   ├── macro_rebalancer.py
│   │   │   │   ├── allergen_filter.py
│   │   │   │   ├── nutrient_checker.py
│   │   │   │   ├── variety_optimizer.py
│   │   │   │   └── pipeline.py
│   │   │   ├── models/
│   │   │   └── utils/
│   │   ├── tests/
│   │   └── pyproject.toml
│   │
│   ├── commerce-service/           # Node.js — Instacart integration
│   │   └── ...
│   │
│   ├── analytics-service/          # Node.js — tracking & reporting
│   │   └── ...
│   │
│   └── trend-intelligence/         # Python (FastAPI) — Phase 2+: SNS 소셜 리스닝
│       ├── src/
│       │   ├── collectors/         # Platform-specific data collectors
│       │   ├── nlp/                # NLP pipeline (entity extraction, classification)
│       │   ├── curation/           # Admin approval workflow
│       │   └── api/
│       ├── tests/
│       └── pyproject.toml
│
├── packages/
│   ├── shared-types/               # TypeScript types shared across services
│   ├── ui-kit/                     # Shared React components (mobile + web)
│   └── api-client/                 # Generated API client (OpenAPI)
│
├── infra/
│   ├── terraform/                  # AWS infrastructure
│   ├── docker/                     # Dockerfiles per service
│   └── k8s/                       # K8s manifests (if needed)
│
├── db/
│   ├── migrations/                 # PostgreSQL migrations (node-pg-migrate)
│   └── seeds/                      # Seed data (celebrities, recipes)
│
├── .claude/
│   ├── rules/                      # Modular agent rules (path-scoped)
│   │   ├── security.md             # 보안, PHI, 계정 삭제 절차
│   │   ├── database.md             # DB 무결성, 마이그레이션, 감사 로그
│   │   ├── code-style.md           # TS/Python/React 코딩 컨벤션
│   │   ├── api-conventions.md      # API 설계, 에러, 서비스 간 통신
│   │   ├── testing-ci.md           # 테스트, CI/CD, Git, DoD 체크리스트
│   │   ├── evaluator-runtime.md    # Evaluator 런타임 검증 + Playwright MCP
│   │   ├── spec-dod.md             # DoD 해석 규칙
│   │   └── domain/
│   │       ├── ai-engine.md        # AI 엔진 안전장치, 영양 bounds
│   │       └── content.md          # 셀러브리티, 면책, 트렌드, 접근성
│   └── settings.json               # 모델·권한·훅 설정
│
├── docs/
│   ├── spec.md                     # This file
│   ├── IMPLEMENTATION_LOG.md       # Session-bridging progress log (append-only)
│   └── api/                        # OpenAPI specs (auto-generated)
│
├── CLAUDE.md                       # Agent constitution (인덱스, ~60줄)
├── package.json                    # Monorepo root (pnpm workspaces)
├── pnpm-workspace.yaml
├── turbo.json                      # Turborepo config
└── .github/
    └── workflows/                  # CI/CD pipelines
```

---

### 11.1 Cognito Identity Resources *(PIVOT-MOBILE-2026-05)*

`infra/terraform/cognito.tf` 가 두 종류의 Cognito User Pool Client 를 산출한다 (INFRA-MOBILE-001 / PR #35):

| Client | type | 용도 | id_token audience |
|--------|------|-----|-------------------|
| `aws_cognito_user_pool_client.bff` | confidential (with secret) | web BFF (server-to-server), 향후 admin 콘솔 | `bff` client_id |
| `aws_cognito_user_pool_client.mobile` | public (no secret) | `apps/mobile` Amplify SRP / Hosted UI | `mobile` client_id |

- Mobile public client: `generate_secret = false` + `explicit_auth_flows = ["ALLOW_USER_SRP_AUTH","ALLOW_REFRESH_TOKEN_AUTH"]` — App Store / Play Store 배포 바이너리에 client secret 미포함.
- user-service `/auth/signup`·`/auth/login` 의 id_token 검증은 `aud` 배열 검증으로 두 client 발급 토큰을 모두 수용한다 (IMPL-MOBILE-AUTH-001).
- `/auth/login` 은 Cognito JWKS-검증된 id_token 의 `sub` 로 `users` 행 매칭 실패 시 (a) email-bridge (`dev-%` cognito_sub legacy seed 사용자 atomic update) 시도 후, 그래도 매칭 실패 시 (b) lazy provisioning 으로 자동 user 행 생성 (`IMPL-AUTH-LAZY-PROVISION-001`). lazy provisioning 은 IdP-first 패턴의 안전망으로 admin-create-user 시드 / DR 복원 / signup partial failure 등에서 발생하는 Cognito-DB drift 자동 회복. `auth.user.lazy_provisioned` 감사 이벤트 emit (best-effort, `hashId` 만).
- Terraform stage-only protection: `lifecycle.precondition { var.environment != "prod" }` (CHORE-006 패턴) — mobile client 도 staging 외 배포 차단.

### 11.2 Mobile CI / ESLint Guard *(PIVOT-MOBILE-2026-05)*

`apps/mobile` (Expo / React Native) 패키지가 **존재하기 전부터** mobile 도메인 위반을 차단하는 가드 두 종을 JUNWON 이 사전 배치한다 (CHORE-MOBILE-001).

| 가드 | 위치 | 효과 |
|------|------|-----|
| ESLint `no-restricted-imports` overrides | `eslint.config.mjs` (루트) — `files: ['apps/mobile/**/*.{ts,tsx}']` 블록 | `@celebbase/service-core` (Fastify/pg/jose Node.js 전용) + `@celebbase/ui-kit` (react-dom + CSS Modules + DOM API) import 시 **lint error**. IDE 빨간 줄 + PR CI lint 단계에서 즉시 차단. |
| Mobile CI workflow | `.github/workflows/mobile-ci.yml` | `apps/mobile/**` · `packages/shared-types/**` · `packages/design-tokens/**` · `eslint.config.mjs` · `pnpm-lock.yaml` 변경 PR/push 시 `pnpm --filter mobile lint/typecheck/test` 실행. `apps/mobile/package.json` 부재 시 (동료 M0 시작 전) 안전 스킵. |

본 가드의 2차 방어선 (Metro `resolveRequest` throw, `apps/mobile/metro.config.js`) 는 동료 M0 작업 — multi-session.md §1 도메인 경계 (`apps/mobile/**` = 동료 단독). JUNWON 은 root config 만 사전 배치하여 도메인 침범 없이 동료 첫날 unblock 효과를 만든다 (Plan v5 §Pre-work Session C, `pipeline/templates/CODEX-HANDOFF.template.md` 미사용 — L1 chore 직접 구현).

design-tokens 의 RN 익스포트 (`tokens.native.ts`) 는 web/mobile token drift 방지를 위해 두 클라이언트가 동일 source 를 import 한다.

### 11.3 Mobile fetch wrapper + auto-login *(PIVOT-MOBILE-2026-05, IMPL-MOBILE-M2-FETCH-001)*

`apps/mobile` 의 protected BFF 호출은 `src/lib/fetch-with-refresh.ts` 의 `authedFetch<T>(path, options?)` 만 사용한다 — M1 의 `postJson()` (단발성 unauthenticated POST 용) 과 분리. 라운드트립 단계:

| 단계 | 동작 | 실패 시 |
|------|------|--------|
| 1 | `getAccessToken()` 으로 SecureStore 에서 access_token 읽어 `Authorization: Bearer` 부착 후 BFF 호출 | (1차) 200 OK 면 JSON 응답 반환 종료 |
| 2 | 401 응답 시 `refreshTokens()` 호출 (module-level `pendingRefresh` promise 공유 — 동시 다발 401 에도 refresh 1회만 트리거, single-flight) | `RefreshResult.status !== 'success'` 면 `signalLogout(reason)` 발사 + `ApiError(401, ...)` throw |
| 3 | refresh success 시 새 access_token 으로 원 요청 1회 재시도 | 재시도도 401 이면 `ApiError` throw — refresh 2회 트리거 금지 (무한 루프 방지) |

**Cold start 진입 분기** (`src/services/auth-bootstrap.ts` + `App.tsx`):
- `App.tsx` 초기 screen state = `'loading'` (디자인 토큰 brand 컬러 ActivityIndicator).
- `useEffect` 첫 실행에서 `bootstrapSession()` 호출 → SecureStore 의 `access_token` + `refresh_token` 둘 다 존재 확인 시 `'authenticated'`, 하나라도 부재 시 `'login'`. 검증 fetch 호출은 안 한다 (낙관적 — 첫 protected API 가 401 이면 위 라운드트립이 알아서 처리).
- 한 토큰만 존재하는 비정상 상태 (`clearTokens` non-atomic edge case) 는 `'login'` 으로 안전 분기.

**Logout 신호 채널** (`src/lib/auth-events.ts`):
- module-level Set<Handler> singleton — React Context 보다 가볍게, fetch wrapper 가 어느 hook 밖에서도 호출 가능.
- `signalLogout(reason: LogoutReason)` — `RefreshResult['status']` 에서 `'success'` 를 제외한 5종 union. §9.3 Refresh Token Reason Codes 와 1:1 대응 (`expired_or_missing` / `reuse_detected` / `revoked` / `malformed` / `account_deleted`).
- `onLogoutSignal(handler): unsubscribe` — `App.tsx` 의 `useEffect` 가 mount 시 1회 구독. handler 가 throw 해도 다른 구독자 격리 (try/catch).
- 수신 시 `App.tsx` 동작: `reuse_detected` / `account_deleted` 는 RN `Alert.alert()` 로 사용자에게 사유 안내 (보안 경고 / 계정 삭제 안내), 그 외 3종 (`expired_or_missing` / `revoked` / `malformed`) 은 silent. 모든 경우 screen state `'login'` 으로 전환.

**불변식**:
- `authedFetch` 는 BFF 경로만 호출 — `/auth/refresh` 자체는 본 wrapper 가 호출하지 않는다 (refresh state machine 이 user-service 직접 호출, §11 Mobile auth ingress 의 예외 규칙 정합).
- refresh single-flight 의 `pendingRefresh` 는 `.finally(() => { pendingRefresh = null })` 로 항상 클리어 — 실패한 refresh 도 다음 401 에서 새로 트리거 가능해야 한다 (idempotent retry).
- `signalLogout` 은 sync 발사 — handler 가 React state update (setState) 를 호출하므로 fetch wrapper 의 throw 와 UI 전환이 같은 microtask 안에서 일어나 race 없음.

---

## 12. Seed Data Requirements

MVP 출시 시 최소 10명의 셀럽 프로필과 식단 데이터가 필요하다.

### 12.1 Initial Celebrity Roster

| Category | Celebrity | Diet Focus |
|----------|-----------|------------|
| Diet | Ariana Grande | Plant-based, Japanese-inspired |
| Diet | Beyoncé | 22-Day Vegan Reset |
| Diet | Gwyneth Paltrow | Clean eating, anti-inflammatory |
| Protein | Cristiano Ronaldo | High-protein, 6-meal structure |
| Protein | LeBron James | Performance nutrition, recovery-focused |
| Protein | Dwayne Johnson | Mass-gain, structured macros |
| Vegetarian | Natalie Portman | Ethical vegan, whole foods |
| Vegetarian | Joaquin Phoenix | Raw vegan, minimalist |
| General | Jennifer Aniston | IF + Mediterranean |
| General | Tom Brady | TB12 Method, anti-inflammatory |

### 12.2 Per Celebrity Data Required

- 프로필 정보 (bio, avatar, cover image)
- 최소 1개 base_diet (식단 철학, 매크로 비율, 포함/제외 식품군)
- base_diet당 최소 18개 recipes (breakfast 4, lunch 4, dinner 4, snack 4, smoothie 2)
  - **다양성 규칙 정합성**: 7일 식단에서 동일 레시피 최대 2회 반복 → meal_type별 최소 `ceil(7/2) = 4`개 필요
- 레시피당 완전한 영양 정보 + 재료 목록 + 조리 단계
- 재료별 Instacart 상품 매핑

> 총 최소 180개 레시피, 약 600개 고유 재료 데이터

---

## Appendix A: Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/celebbase
REDIS_URL=redis://host:6379

# AWS
AWS_REGION=us-west-2
AWS_COGNITO_USER_POOL_ID=us-west-2_xxxxx
AWS_COGNITO_CLIENT_ID=xxxxx          # web BFF (confidential, with secret)
COGNITO_MOBILE_CLIENT_ID=xxxxx       # apps/mobile (public, no secret) — PIVOT-MOBILE-2026-05 / IMPL-MOBILE-AUTH-001
                                     # user-service 는 audience = [client_id, mobile_client_id] 배열 ANY-match 로 검증
                                     # empty string 은 undefined 로 normalize (web-only deployment 호환)
AWS_S3_BUCKET=celebbase-assets
AWS_SQS_MEAL_PLAN_QUEUE=celebbase-meal-plan-queue

# Instacart
INSTACART_API_KEY=xxx
INSTACART_API_BASE_URL=https://connect.instacart.com/v2
INSTACART_WEBHOOK_SECRET=xxx

# Stripe
STRIPE_SECRET_KEY=sk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PREMIUM_PRICE_ID=price_xxx
STRIPE_ELITE_PRICE_ID=price_xxx

# Elasticsearch
ELASTICSEARCH_URL=https://host:9200

# Monitoring
DATADOG_API_KEY=xxx
SENTRY_DSN=https://xxx@sentry.io/xxx

# App
NODE_ENV=production
LOG_LEVEL=info
API_PORT=3000
AI_ENGINE_PORT=8000
WS_BASE_URL=wss://api.celebbase.com

# PHI Encryption (§9.3)
AWS_KMS_PHI_KEY_ARN=arn:aws:kms:us-west-2:xxx:key/xxx
```
