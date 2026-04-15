-- Migration: 0005_subscription-stripe-index
-- Description: Add indexes for Stripe subscription management
--   - UNIQUE on stripe_subscription_id for ON CONFLICT upsert
--   - Index on user_id for fast lookups
--   - Partial unique on (user_id) for active/past_due to prevent multiple active subs

-- UNIQUE index for ON CONFLICT (stripe_subscription_id) DO UPDATE
-- Non-partial: PG treats NULLs as distinct, so rows with NULL stripe_subscription_id don't conflict
CREATE UNIQUE INDEX idx_subscriptions_stripe_sub_id
  ON subscriptions(stripe_subscription_id);

-- Lookup index for user_id
CREATE INDEX idx_subscriptions_user_id
  ON subscriptions(user_id);

-- Prevent multiple active subscriptions per user (DB-level invariant)
CREATE UNIQUE INDEX idx_subscriptions_user_active
  ON subscriptions(user_id)
  WHERE status IN ('active', 'past_due');
