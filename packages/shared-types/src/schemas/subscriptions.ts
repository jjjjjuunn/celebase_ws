// Sprint B subscriptions wire schemas (IMPL-APP-002-0d).
//
// BFF proxies user-service `/subscriptions` responses. The DB `subscriptions`
// table stores only premium/elite rows — free tier is represented by absence
// (null response from `GET /subscriptions/me`).
//
// Stripe Checkout Session creation and webhook handling land in 002-0e.
// This file is schema + type definitions only; no Stripe SDK dependency here.

import { z } from 'zod';
import type { Subscription } from '../entities.js';
import { IsoDateTime, UuidV7 } from './_utils.js';
import { QuotaOverrideSchema } from '../jsonb/index.js';
import { SubscriptionStatus, SubscriptionTier } from '../enums.js';

// Tier enum for the subscriptions table: only premium/elite rows exist.
const PaidTier = SubscriptionTier.exclude(['free']);

export const SubscriptionWireSchema = z.object({
  id: UuidV7,
  user_id: UuidV7,
  tier: PaidTier,
  stripe_subscription_id: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  status: SubscriptionStatus,
  current_period_start: IsoDateTime.nullable(),
  current_period_end: IsoDateTime.nullable(),
  cancel_at_period_end: z.boolean(),
  quota_override: QuotaOverrideSchema,
  created_at: IsoDateTime,
});
export type SubscriptionWire = z.infer<typeof SubscriptionWireSchema>;

// POST /subscriptions — start a paid subscription. BE creates a Stripe
// Checkout Session and returns the redirect URL. Client navigates there.
export const CreateSubscriptionRequestSchema = z.object({
  tier: PaidTier,
});
export type CreateSubscriptionRequest = z.infer<typeof CreateSubscriptionRequestSchema>;

export const CreateSubscriptionResponseSchema = z.object({
  checkout_url: z.string().url(),
});
export type CreateSubscriptionResponse = z.infer<typeof CreateSubscriptionResponseSchema>;

// GET /subscriptions/me — returns the user's current tier only.
//
// user-service owns `users.subscription_tier` (denormalized fast-path for
// tier-gate decisions) and exposes only that field via this endpoint
// (`services/user-service/src/routes/subscription.routes.ts`). Full
// subscription details (Stripe customer/period, cancel_at_period_end) are
// commerce-service owned and will be exposed via a separate endpoint once
// commerce-service is deployed on staging (CHORE-STAGING-BE-DEPLOY-001).
//
// History: prior shape `{ subscription: SubscriptionWire | null }` assumed
// commerce-service `subscriptions` table as source-of-truth, but user-service
// returns only `{ tier }`. Schema simplified to match deployed reality
// (IMPL-MOBILE-SUB-SCHEMA-001). `SubscriptionWireSchema` is preserved for
// cancel/checkout endpoints that still surface the full row.
//
// The time-boxed free trial (FEAT-MOBILE-TRIAL-MEALPLAN-001) was replaced by the
// credit model (IMPL-MEAL-CREDIT-001): a free user now gets a one-time lifetime
// grant of meal-plan credits instead of a 3-day Premium-equivalent window. The
// `trial_active` / `trial_ends_at` fields are removed here; meal-plan credit
// state is exposed by `MealPlanCreditsResponseSchema` (see meal-plans.ts).
export const GetMySubscriptionResponseSchema = z.object({
  tier: SubscriptionTier,
});
export type GetMySubscriptionResponse = z.infer<typeof GetMySubscriptionResponseSchema>;

// POST /subscriptions/me/cancel — sets cancel_at_period_end=true.
// Returns the updated subscription row.
export const CancelSubscriptionResponseSchema = z.object({
  subscription: SubscriptionWireSchema,
});
export type CancelSubscriptionResponse = z.infer<typeof CancelSubscriptionResponseSchema>;

// POST /subscriptions/sync — mobile-driven (IMPL-MOBILE-SUB-SYNC-002). BFF reads
// RevenueCat REST via commerce-service and returns the resolved tier. Thin
// response distinct from SubscriptionWire (no Stripe fields). `source` tags the
// trigger; `status` adds 'free' on top of SubscriptionStatus for the
// no-entitlement case. Shared here so the BFF route and the mobile client stop
// carrying duplicate inline copies that can silently drift.
export const SyncSubscriptionSource = z.enum(['purchase', 'app_open', 'manual']);
export type SyncSubscriptionSourceValue = z.infer<typeof SyncSubscriptionSource>;

export const SyncSubscriptionRequestSchema = z
  .object({
    source: SyncSubscriptionSource,
  })
  .strict();
export type SyncSubscriptionRequest = z.infer<typeof SyncSubscriptionRequestSchema>;

export const SyncSubscriptionResponseSchema = z
  .object({
    user_id: UuidV7,
    tier: SubscriptionTier,
    status: z.enum(['active', 'past_due', 'cancelled', 'expired', 'free']),
    current_period_end: z.string().nullable(),
    source: SyncSubscriptionSource,
  })
  .strict();
export type SyncSubscriptionResponse = z.infer<typeof SyncSubscriptionResponseSchema>;

// Wire↔Row parity guard: non-nullable date fields must align with entity.
const _subWireRowParity = null as unknown as Omit<
  SubscriptionWire,
  | 'current_period_start'
  | 'current_period_end'
  | 'quota_override'
  | 'stripe_subscription_id'
  | 'stripe_customer_id'
> satisfies {
  id: Subscription['id'];
  user_id: Subscription['user_id'];
  tier: Subscription['tier'];
  status: Subscription['status'];
  cancel_at_period_end: Subscription['cancel_at_period_end'];
  created_at: string;
};
void _subWireRowParity;
