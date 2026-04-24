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

// GET /subscriptions/me — current subscription or null (free tier).
export const GetMySubscriptionResponseSchema = z.object({
  subscription: SubscriptionWireSchema.nullable(),
});
export type GetMySubscriptionResponse = z.infer<typeof GetMySubscriptionResponseSchema>;

// POST /subscriptions/me/cancel — sets cancel_at_period_end=true.
// Returns the updated subscription row.
export const CancelSubscriptionResponseSchema = z.object({
  subscription: SubscriptionWireSchema,
});
export type CancelSubscriptionResponse = z.infer<typeof CancelSubscriptionResponseSchema>;

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
