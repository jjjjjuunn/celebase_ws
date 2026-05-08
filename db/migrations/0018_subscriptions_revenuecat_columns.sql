-- IMPL-MOBILE-SUB-SYNC-001 — RevenueCat subscription tracking columns
-- Adds provider discriminator + RevenueCat identifiers for refresh-from-revenuecat sync.
-- forward-only: rollback via new migration.

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'stripe'
        CHECK (provider IN ('stripe','revenuecat')),
    ADD COLUMN IF NOT EXISTS revenuecat_subscription_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS revenuecat_app_user_id VARCHAR(100);

-- Partial UNIQUE index for RevenueCat-provider rows only.
-- Stripe rows continue to rely on stripe_subscription_id semantics.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_revenuecat_subscription_id_uq
    ON subscriptions (revenuecat_subscription_id)
    WHERE provider = 'revenuecat' AND revenuecat_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_revenuecat_app_user_id_idx
    ON subscriptions (revenuecat_app_user_id)
    WHERE provider = 'revenuecat' AND revenuecat_app_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_provider_idx
    ON subscriptions (provider);
