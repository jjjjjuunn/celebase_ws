-- Migration: 0001_initial-schema
-- Description: Initial database schema for CelebBase Wellness (Phase 1 MVP)
-- Tables: 14 + 1 materialized view
-- Extensions: pg_uuidv7

-- ============================================
-- EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pg_uuidv7";

-- ============================================
-- UTILITY: updated_at trigger function
-- ============================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_cognito ON users(cognito_sub);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- BIO PROFILE (Onboarding Survey Data)
-- ============================================

CREATE TABLE bio_profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

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
    allergies       TEXT[] DEFAULT '{}',
    intolerances    TEXT[] DEFAULT '{}',
    medical_conditions TEXT[] DEFAULT '{}',
    medications     TEXT[] DEFAULT '{}',

    -- Biomarkers (optional, from lab results)
    biomarkers      JSONB DEFAULT '{}',

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
    bmr_kcal        INTEGER,
    tdee_kcal       INTEGER,
    target_kcal     INTEGER,
    macro_targets   JSONB DEFAULT '{}',

    version         INTEGER DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_bio_profiles_user ON bio_profiles(user_id);

CREATE TRIGGER trg_bio_profiles_updated_at
    BEFORE UPDATE ON bio_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- CELEBRITIES
-- ============================================

CREATE TABLE celebrities (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    slug            VARCHAR(100) UNIQUE NOT NULL,
    display_name    VARCHAR(150) NOT NULL,
    short_bio       TEXT,
    avatar_url      TEXT NOT NULL,
    cover_image_url TEXT,

    category        VARCHAR(20) NOT NULL
                    CHECK (category IN ('diet','protein','vegetarian','general')),
    tags            TEXT[] DEFAULT '{}',

    is_featured     BOOLEAN DEFAULT FALSE,
    sort_order      INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_celebrities_category ON celebrities(category) WHERE is_active = TRUE;
CREATE INDEX idx_celebrities_featured ON celebrities(is_featured, sort_order) WHERE is_active = TRUE;

CREATE TRIGGER trg_celebrities_updated_at
    BEFORE UPDATE ON celebrities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- BASE DIETS (Celebrity's known diet framework)
-- ============================================

CREATE TABLE base_diets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    celebrity_id    UUID NOT NULL REFERENCES celebrities(id),

    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    philosophy      TEXT,

    diet_type       VARCHAR(20) NOT NULL,
    avg_daily_kcal  INTEGER,
    macro_ratio     JSONB NOT NULL,

    included_foods  TEXT[] DEFAULT '{}',
    excluded_foods  TEXT[] DEFAULT '{}',
    key_supplements TEXT[] DEFAULT '{}',

    source_refs     JSONB DEFAULT '[]',
    verified_by     VARCHAR(100),

    last_verified_at TIMESTAMPTZ DEFAULT NOW(),
    version         INTEGER DEFAULT 1,

    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_base_diets_celeb ON base_diets(celebrity_id) WHERE is_active = TRUE;

CREATE TRIGGER trg_base_diets_updated_at
    BEFORE UPDATE ON base_diets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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

    nutrition       JSONB NOT NULL,
    instructions    JSONB NOT NULL,

    tips            TEXT,
    image_url       TEXT,
    video_url       TEXT,

    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recipes_diet ON recipes(base_diet_id) WHERE is_active = TRUE;
CREATE INDEX idx_recipes_meal ON recipes(meal_type);

CREATE TRIGGER trg_recipes_updated_at
    BEFORE UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- INGREDIENTS (master list)
-- ============================================

CREATE TABLE ingredients (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    name                VARCHAR(200) NOT NULL,
    name_normalized     VARCHAR(200) NOT NULL,
    category            VARCHAR(50),

    instacart_product_id VARCHAR(100),
    instacart_upc       VARCHAR(50),
    default_unit        VARCHAR(20),

    allergens           TEXT[] DEFAULT '{}',
    nutrition_per_100g  JSONB DEFAULT '{}',

    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ingredients_normalized ON ingredients(name_normalized);

-- ============================================
-- RECIPE <-> INGREDIENT (join table)
-- ============================================

CREATE TABLE recipe_ingredients (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id),

    quantity        DECIMAL(8,2) NOT NULL,
    unit            VARCHAR(20) NOT NULL,
    preparation     VARCHAR(100),
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

    adjustments     JSONB DEFAULT '{}',

    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,

    daily_plans     JSONB NOT NULL,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_meal_plans_user ON meal_plans(user_id, status) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_meal_plans_updated_at
    BEFORE UPDATE ON meal_plans
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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

    subtotal_usd        DECIMAL(10,2),
    delivery_fee_usd    DECIMAL(6,2),
    total_usd           DECIMAL(10,2),

    delivery_address_id UUID,
    scheduled_delivery  TIMESTAMPTZ,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON instacart_orders(user_id, created_at DESC);

CREATE TRIGGER trg_instacart_orders_updated_at
    BEFORE UPDATE ON instacart_orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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

    quota_override      JSONB DEFAULT '{}',

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- USER TRACKING / FEEDBACK
-- ============================================

CREATE TABLE daily_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         UUID NOT NULL REFERENCES users(id),
    log_date        DATE NOT NULL,

    meals_completed JSONB DEFAULT '{}',

    weight_kg       DECIMAL(5,1),
    energy_level    INTEGER CHECK (energy_level BETWEEN 1 AND 5),
    mood            INTEGER CHECK (mood BETWEEN 1 AND 5),
    sleep_quality   INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
    notes           TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, log_date)
);

-- ============================================
-- DIET VIEW EVENTS
-- ============================================

CREATE TABLE diet_view_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         UUID NOT NULL REFERENCES users(id),
    base_diet_id    UUID NOT NULL REFERENCES base_diets(id),

    viewed_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_diet_views_user_month ON diet_view_events(user_id, viewed_at DESC);

-- ============================================
-- PHI ACCESS AUDIT LOG (HIPAA)
-- ============================================

CREATE TABLE phi_access_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         UUID NOT NULL,
    accessed_by     VARCHAR(100) NOT NULL,
    action          VARCHAR(20) NOT NULL
                    CHECK (action IN ('READ','WRITE','DELETE')),
    phi_fields      TEXT[] NOT NULL,
    purpose         TEXT NOT NULL,
    request_id      VARCHAR(100),
    ip_address      INET,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    retention_until TIMESTAMPTZ DEFAULT NOW() + INTERVAL '6 years'
);

CREATE INDEX idx_phi_logs_user ON phi_access_logs(user_id, created_at DESC);
CREATE INDEX idx_phi_logs_retention ON phi_access_logs(retention_until);

-- ============================================
-- MATERIALIZED VIEW: monthly meal plan stats
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
