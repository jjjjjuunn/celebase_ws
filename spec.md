# CelebBase Wellness — Technical Specification v1.1

> **Status**: Draft  
> **Last Updated**: 2026-04-03 (v1.1)  
> **Changelog**: 실시간 트렌드 비전 반영, Trend Intelligence Service 추가, Instacart 에러 핸들링 확장, Evaluator Rubric 추가  
> **Architecture**: PGE (Planner-Generator-Evaluator) Harness  
> **Target Platform**: iOS / Android (React Native) + Web (Next.js)

---

## 1. Product Overview

CelebBase Wellness는 셀러브리티 식단을 사용자의 생체 데이터에 맞춰 초개인화하고, 원재료를 원클릭 배송하는 프리미엄 B2C 웰니스 플랫폼이다.

**장기 비전**: 단순히 과거의 정적 식단을 제공하는 것을 넘어, 셀러브리티의 **실시간 라이프스타일 변화**(SNS 포스트, 인터뷰, 웰니스 트렌드)를 AI 소셜 리스닝으로 추적하여 **동적 베이스 레이어(Dynamic Base Layer)**로 진화시키는 것이 최종 목표이다. 이를 통해 사용자가 최신 웰니스 트렌드를 파악하기 위해 가장 먼저 접속하는 **트렌드 허브(Trend Hub)** 역할을 수행한다.

> **Phase 전략**: MVP(Phase 1)에서는 편집팀이 큐레이팅한 정적 식단 데이터로 핵심 가치를 검증한 뒤, Phase 2~3에서 실시간 트렌드 파이프라인을 점진적으로 도입한다.

### 1.1 Core Value Loop

```
[Real-time Trend Intelligence] ← Phase 2+: SNS 소셜 리스닝, 트렌드 감지
        ↓
[Celebrity Diet Selection / Dynamic Base Layer]
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
| Aspirational Millennial | 셀럽 라이프스타일 동경 2030세대 | 사회적 증거 기반 자기관리 동기부여 |

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ React Native │  │   Next.js    │  │  Admin Dashboard │   │
│  │  (iOS/AOS)   │  │   (Web App)  │  │    (Internal)    │   │
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
| Mobile | React Native 0.76+ (New Arch) | 크로스 플랫폼, Hermes 엔진 성능 |
| Web | Next.js 15 (App Router) | SSR/ISR, SEO, 공유 컴포넌트 |
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
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Physical Metrics
    birth_year      INTEGER,
    sex             VARCHAR(20),
    height_cm       DECIMAL(5,1),
    weight_kg       DECIMAL(5,1),
    waist_cm        DECIMAL(5,1),
    body_fat_pct    DECIMAL(4,1),
    
    -- Activity & Lifestyle
    activity_level  VARCHAR(20) 
                    CHECK (activity_level IN ('sedentary','light','moderate','active','very_active')),
    sleep_hours_avg DECIMAL(3,1),
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
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_base_diets_celeb ON base_diets(celebrity_id) WHERE is_active = TRUE;

-- ============================================
-- RECIPES (tied to base diets)
-- ============================================

CREATE TABLE recipes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ingredients_normalized ON ingredients(name_normalized);

-- ============================================
-- RECIPE ↔ INGREDIENT (join table)
-- ============================================

CREATE TABLE recipe_ingredients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    base_diet_id    UUID NOT NULL REFERENCES base_diets(id),
    
    name            VARCHAR(200),
    status          VARCHAR(20) DEFAULT 'draft'
                    CHECK (status IN ('draft','active','completed','archived')),
    
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
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meal_plans_user ON meal_plans(user_id, status);

-- ============================================
-- INSTACART ORDERS
-- ============================================

CREATE TABLE instacart_orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USER TRACKING / FEEDBACK
-- ============================================

CREATE TABLE daily_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
```

### 3.2 Entity Relationship Summary

```
users 1──1 bio_profiles
users 1──N meal_plans
users 1──N instacart_orders
users 1──N daily_logs
users 1──1 subscriptions

celebrities 1──N base_diets
base_diets 1──N recipes
recipes N──N ingredients (via recipe_ingredients)

meal_plans N──1 base_diets
meal_plans 1──N instacart_orders
```

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
    "details": [{ "field": "weight_kg", "issue": "must be positive" }]
  }
}
```
- **HTTP Status Codes**: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 422 Unprocessable Entity, 429 Rate Limited, 500 Internal Error

### 4.2 Endpoint Catalog

#### Auth & User

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/auth/signup` | 소셜/이메일 가입 | No |
| POST | `/auth/login` | 로그인 (Cognito) | No |
| POST | `/auth/refresh` | 토큰 리프레시 | Refresh |
| GET | `/users/me` | 내 프로필 조회 | JWT |
| PATCH | `/users/me` | 프로필 수정 | JWT |
| DELETE | `/users/me` | 계정 삭제 (soft) | JWT |

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
  "status": "generating",
  "estimated_completion_sec": 15,
  "poll_url": "/meal-plans/uuid"
}
```
> 식단 생성은 비동기(SQS)로 처리. 클라이언트는 polling 또는 WebSocket으로 완료 확인.

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
| POST | `/subscriptions` | 구독 시작 (Stripe) | JWT |
| GET | `/subscriptions/me` | 내 구독 정보 | JWT |
| POST | `/subscriptions/me/cancel` | 구독 해지 | JWT |
| POST | `/webhooks/stripe` | Stripe 웹훅 수신 | Stripe Sig |

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
  athletic_perf     → 1.10–1.25 (activity-dependent)
```

**Step 2: Macro Rebalancing**
```
protein_g = weight_kg × protein_multiplier

protein_multiplier:
  sedentary         → 1.2 g/kg
  moderate          → 1.6 g/kg
  active            → 2.0 g/kg
  glp1_support      → 2.2 g/kg  (muscle preservation priority)
  muscle_gain       → 2.2 g/kg

remaining_kcal = target_kcal - (protein_g × 4)
fat_kcal = remaining_kcal × base_diet.fat_ratio
carb_kcal = remaining_kcal × (1 - base_diet.fat_ratio)
```

**Step 3: Allergen Filtering**
- 사용자의 `allergies[]` 및 `intolerances[]` 에 해당하는 재료를 포함한 레시피를 자동 대체
- 대체 재료 매핑 테이블(substitution_map)에서 영양소 프로필이 가장 유사한 대안 선택
- 대체 불가능한 경우 해당 레시피 전체를 같은 meal_type의 다른 레시피로 교체

**Step 4: Micronutrient Compliance**
- FDA Recommended Daily Allowances(RDA) 대비 일일 식단의 주요 미량영양소 충족률 계산
- 70% 미만 충족 영양소가 있을 경우 해당 영양소가 풍부한 식재료 추가 또는 보충제 권고

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
| **상품 매핑 실패** (Instacart에 없는 재료) | 해당 재료를 장바구니에서 제외 + PDF 별도 목록에 포함 | "3개 품목은 직접 구매가 필요합니다" 안내 |
| **Instacart API 타임아웃** (>5s) | Circuit breaker open → 캐시된 가격으로 미리보기 제공 | "예상 가격으로 표시됩니다" 배지 |
| **Instacart API 인증 실패** (401/403) | 자동 토큰 갱신 1회 시도 → 실패 시 사용자 재연동 유도 | "Instacart 연결을 갱신해 주세요" 딥링크 |
| **Instacart 완전 장애** (5xx, circuit open) | PDF 쇼핑 리스트 자동 생성 | "현재 배송 서비스 점검 중입니다. 쇼핑 리스트를 다운로드하세요" |
| **서비스 불가 지역** | 지역 감지 → 배송 불가 안내 + PDF 폴백 | "해당 지역은 배송 미지원입니다" |
| **부분 실패** (일부 상품만 추가 성공) | 성공 품목으로 장바구니 생성 + 실패 품목 별도 표시 | 장바구니에 "N개 품목 추가 실패" 배너 |

**Fallback Priority:**
1. 대체 상품 자동 추천 (같은 카테고리 내)
2. Amazon Fresh / Whole Foods 대체 연동 (Phase 2)
3. PDF 쇼핑 리스트 다운로드 (최후 폴백)

---

## 6A. Trend Intelligence Service (Phase 2+)

> 이 섹션은 Phase 2 이후 구현 대상이다. MVP에서는 편집팀이 수동으로 셀럽 식단 데이터를 관리한다.
> Phase 1 아키텍처는 아래 서비스를 나중에 플러그인할 수 있도록 **Content Service에 이벤트 기반 업데이트 인터페이스**를 미리 설계한다.

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
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

### 7.1 Onboarding Flow

```
[S1: Welcome]
  ↓  "Get Started"
[S2: Auth]  ← Apple/Google SSO or Email
  ↓
[S3: Basic Info]  ← Name, Birth Year, Sex
  ↓
[S4: Body Metrics]  ← Height, Weight, Waist (optional)
  ↓
[S5: Activity Level]  ← Visual selector (5 levels)
  ↓
[S6: Health Info]  ← Allergies (multi-select), Conditions, Medications
  ↓
[S7: Biomarker Upload]  ← Photo/PDF of lab results (optional, OCR parsed)
  ↓
[S8: Wellness Goal]  ← Primary goal selector + secondary goals
  ↓
[S9: Dietary Preference]  ← Diet type + cuisine preferences
  ↓
[S10: Profile Summary]  ← Review & confirm all inputs
  ↓
[S11: Category Selection]  ← Diet / Protein / Vegetarian / General
```

### 7.2 Main App Flow

```
[Tab 1: Discover]
  ├── Featured Celebrities Carousel
  ├── Category Tabs (Diet / Protein / Vegetarian / General)
  ├── Celebrity Cards → Celebrity Detail
  │     ├── Bio & Philosophy
  │     ├── Available Diets
  │     └── "Try This Diet" CTA → Meal Plan Generation
  └── Search Bar (Celebrities, Recipes)

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
| Meal plan generation | < 15 seconds |
| App cold start (mobile) | < 2 seconds |
| Image load (CDN) | < 300ms |
| Instacart cart creation | < 3 seconds |

### 9.2 Scalability

- 초기 목표: 50K MAU
- 설계 기준: 500K MAU까지 수평 확장 가능
- Auto-scaling: ECS Fargate (서비스별 독립 스케일링)
- DB: Read replicas (최소 2개), Connection pooling (PgBouncer)

### 9.3 Security

- HIPAA-adjacent 수준의 건강 데이터 보호 (PHI는 저장하지 않으나 민감 데이터 취급)
- AES-256 at rest, TLS 1.3 in transit
- PII 필드 암호화 (email, health data)
- SOC 2 Type II 준비 설계
- OWASP Top 10 방어
- Rate limiting: 인증 실패 5회/분, API 1000회/시간 (유저당)

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
| 알레르겐 필터링 | 알레르기 사용자에게 알레르겐 포함 레시피 0건 | 1건이라도 노출 |
| 칼로리 안전 하한선 | 생성된 식단 ≥ 1200kcal/일 (예외 없음) | 1200kcal 미만 결과 생성 |
| 7일 식단 다양성 | 동일 레시피 최대 2회, 연속 동일 주재료 없음 | 3회 이상 반복 |
| 매크로 밸런스 | 단백질/탄수화물/지방 합산 = 총 칼로리 ±3% | ±3% 초과 불일치 |

### 성능

| Criteria | Pass | Fail |
|----------|------|------|
| API p50 응답 시간 | < 100ms | ≥ 100ms |
| API p99 응답 시간 | < 500ms | ≥ 500ms |
| 식단 생성 소요 시간 | < 15초 | ≥ 15초 |
| Instacart 장바구니 생성 | < 3초 | ≥ 3초 |
| DB 쿼리 (단일) | < 50ms | ≥ 50ms |

### 보안

| Criteria | Pass | Fail |
|----------|------|------|
| 하드코딩된 시크릿 | 0건 (코드 내 어디에도 없음) | 1건이라도 발견 |
| SQL injection 취약점 | parameterized query 100% | raw string concat 발견 |
| 인증 우회 | 보호 엔드포인트 인증 없이 접근 불가 | 미인증 접근 가능 |
| 입력 검증 누락 | 모든 API input에 Zod/Pydantic 적용 | 미검증 input 존재 |

### 코드 품질

| Criteria | Pass | Fail |
|----------|------|------|
| TypeScript `any` 사용 | 0건 | 1건 이상 |
| ESLint / ruff 경고 | 0건 | 1건 이상 |
| 테스트 커버리지 (신규 코드) | ≥ 80% | < 80% |
| 전체 테스트 통과율 | 100% | < 100% |

---

## 10. Development Phases

### Phase 1: MVP (Week 1–8)

**Goal**: 핵심 가치 검증 — 셀럽 식단 선택 → 개인화 → 레시피 제공

- [ ] Auth (Cognito + Apple/Google SSO)
- [ ] Onboarding survey (bio profile)
- [ ] Celebrity & base diet CRUD + seed data (10 celebrities)
- [ ] AI personalization engine v1 (calorie + macro + allergen)
- [ ] Personalized meal plan generation & display
- [ ] Recipe detail view
- [ ] Basic daily tracking
- [ ] Subscription (Stripe) — Premium tier only
- [ ] Mobile app (iOS priority) + Web landing page

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

---

## 11. Project Structure

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
├── docs/
│   ├── spec.md                     # This file
│   ├── CLAUDE.md                   # Development guardrails
│   ├── IMPLEMENTATION_LOG.md       # Session-bridging progress log (append-only)
│   └── api/                        # OpenAPI specs (auto-generated)
│
├── CLAUDE.md                       # Root guardrails
├── package.json                    # Monorepo root (pnpm workspaces)
├── pnpm-workspace.yaml
├── turbo.json                      # Turborepo config
└── .github/
    └── workflows/                  # CI/CD pipelines
```

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
- base_diet당 최소 15개 recipes (breakfast 4, lunch 4, dinner 4, snack 2, smoothie 1)
- 레시피당 완전한 영양 정보 + 재료 목록 + 조리 단계
- 재료별 Instacart 상품 매핑

> 총 최소 150개 레시피, 약 500개 고유 재료 데이터

---

## Appendix A: Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/celebbase
REDIS_URL=redis://host:6379

# AWS
AWS_REGION=us-west-2
AWS_COGNITO_USER_POOL_ID=us-west-2_xxxxx
AWS_COGNITO_CLIENT_ID=xxxxx
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
```
