import type pg from 'pg';
import type Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import type { Subscription } from '@celebbase/shared-types';
import { NotFoundError, ValidationError } from '@celebbase/service-core';
import * as subscriptionRepo from '../repositories/subscription.repository.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StripeConfig {
  stripe: Stripe;
  premiumPriceId: string;
  elitePriceId: string;
  webhookSecret: string;
  successUrl: string;
  cancelUrl: string;
}

// ---------------------------------------------------------------------------
// Circuit breaker (lightweight in-process)
// ---------------------------------------------------------------------------

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half_open';
}

const BREAKER_THRESHOLD = 5;
const BREAKER_TIMEOUT_MS = 60_000;

const _breaker: CircuitBreakerState = {
  failures: 0,
  lastFailureTime: 0,
  state: 'closed',
};

async function withCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
  if (_breaker.state === 'open') {
    if (Date.now() - _breaker.lastFailureTime > BREAKER_TIMEOUT_MS) {
      _breaker.state = 'half_open';
    } else {
      throw new Error('Stripe circuit breaker is open');
    }
  }

  try {
    const result = await fn();
    // Success: reset breaker
    _breaker.failures = 0;
    _breaker.state = 'closed';
    return result;
  } catch (err) {
    _breaker.failures += 1;
    _breaker.lastFailureTime = Date.now();
    if (_breaker.failures >= BREAKER_THRESHOLD) {
      _breaker.state = 'open';
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapStripeStatus(
  stripeStatus: string,
): 'active' | 'past_due' | 'cancelled' | 'expired' {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
      return 'cancelled';
    case 'incomplete_expired':
    case 'incomplete':
      return 'expired';
    default:
      throw new Error(`Unknown Stripe subscription status: ${stripeStatus}`);
  }
}

function deriveTierForUsers(
  status: 'active' | 'past_due' | 'cancelled' | 'expired',
  subTier: 'premium' | 'elite',
): 'free' | 'premium' | 'elite' {
  if (status === 'cancelled' || status === 'expired') return 'free';
  return subTier;
}

function resolvePriceId(
  tier: 'premium' | 'elite',
  config: StripeConfig,
): string {
  return tier === 'premium' ? config.premiumPriceId : config.elitePriceId;
}

function tierFromPriceId(
  priceId: string,
  config: StripeConfig,
): 'premium' | 'elite' {
  if (priceId === config.premiumPriceId) return 'premium';
  if (priceId === config.elitePriceId) return 'elite';
  throw new Error(`Unknown Stripe price ID: ${priceId}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout Session and return the hosted URL.
 */
export async function createCheckoutSession(
  pool: pg.Pool,
  config: StripeConfig,
  userId: string,
  tier: 'premium' | 'elite',
): Promise<{ checkout_url: string }> {
  // Guard: no duplicate active subscription
  const existing = await subscriptionRepo.findByUserId(pool, userId);
  if (existing && (existing.status === 'active' || existing.status === 'past_due')) {
    throw new ValidationError('Subscription already active', [
      { field: 'tier', issue: 'You already have an active subscription' },
    ]);
  }

  const session = await withCircuitBreaker(() =>
    config.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        client_reference_id: userId,
        line_items: [{ price: resolvePriceId(tier, config), quantity: 1 }],
        success_url: config.successUrl,
        cancel_url: config.cancelUrl,
        metadata: { tier, user_id: userId },
      },
      { idempotencyKey: randomUUID() },
    ),
  );

  if (!session.url) {
    throw new Error('Stripe Checkout Session did not return a URL');
  }

  return { checkout_url: session.url };
}

/**
 * Get the current user's subscription, or null if free tier.
 */
export async function getMySubscription(
  pool: pg.Pool,
  userId: string,
): Promise<Subscription | null> {
  return subscriptionRepo.findByUserId(pool, userId);
}

/**
 * Request cancellation at period end (webhook-first: local DB updated via webhook only).
 */
export async function cancelSubscription(
  pool: pg.Pool,
  config: StripeConfig,
  userId: string,
): Promise<{ cancel_requested: true; cancel_at_period_end: true }> {
  const sub = await subscriptionRepo.findByUserId(pool, userId);
  if (!sub || sub.status !== 'active') {
    throw new NotFoundError('No active subscription found');
  }
  if (!sub.stripe_subscription_id) {
    throw new Error('Subscription has no Stripe ID');
  }

  const stripeSubId = sub.stripe_subscription_id;
  await withCircuitBreaker(() =>
    config.stripe.subscriptions.update(stripeSubId, {
      cancel_at_period_end: true,
    }),
  );

  // Do NOT update local DB — webhook `customer.subscription.updated` will handle it
  return { cancel_requested: true, cancel_at_period_end: true };
}

// ---------------------------------------------------------------------------
// Webhook event handlers
// ---------------------------------------------------------------------------

/**
 * Process a verified Stripe webhook event.
 * Uses event payload only — never calls stripe.*.retrieve (circuit breaker safety).
 */
export async function handleWebhookEvent(
  pool: pg.Pool,
  event: Stripe.Event,
  config: StripeConfig,
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await onCheckoutCompleted(pool, event.data.object, config);
      break;
    case 'customer.subscription.updated':
      await onSubscriptionChanged(pool, event.data.object, config);
      break;
    case 'customer.subscription.deleted':
      await onSubscriptionDeleted(pool, event.data.object);
      break;
    case 'invoice.payment_failed':
      await onPaymentFailed(pool, event.data.object);
      break;
    default:
      // Unhandled event type — acknowledge with 200, no processing
      break;
  }
}

async function onCheckoutCompleted(
  pool: pg.Pool,
  session: Stripe.Checkout.Session,
  _config: StripeConfig,
): Promise<void> {
  if (session.mode !== 'subscription') return;

  const userId = session.client_reference_id;
  if (!userId) {
    throw new Error('checkout.session.completed missing client_reference_id');
  }

  const stripeSubscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;
  if (!stripeSubscriptionId) {
    throw new Error('checkout.session.completed missing subscription ID');
  }

  const stripeCustomerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id;
  if (!stripeCustomerId) {
    throw new Error('checkout.session.completed missing customer ID');
  }

  // Read tier from metadata (set during createCheckoutSession)
  const tier = (session.metadata?.tier === 'elite' ? 'elite' : 'premium');

  // Use epoch 0 as placeholder — `customer.subscription.updated` webhook will
  // overwrite with real period values from the subscription object.
  // This makes the handler idempotent: replayed events always produce the same state.
  const periodStart = new Date(0);
  const periodEnd = new Date(0);

  const status = mapStripeStatus('active');
  const userTier = deriveTierForUsers(status, tier);

  await subscriptionRepo.syncTierTransaction(pool, userId, stripeSubscriptionId, {
    tier,
    stripe_customer_id: stripeCustomerId,
    status,
    current_period_start: periodStart,
    current_period_end: periodEnd,
  }, userTier);
}

async function onSubscriptionChanged(
  pool: pg.Pool,
  sub: Stripe.Subscription,
  config: StripeConfig,
): Promise<void> {
  const existing = await subscriptionRepo.findByStripeSubscriptionId(pool, sub.id);
  if (!existing) {
    // Orphaned event — may arrive before checkout.session.completed in rare cases
    return;
  }

  const status = mapStripeStatus(sub.status);
  const priceId = sub.items.data[0]?.price.id;
  const tier = priceId ? tierFromPriceId(priceId, config) : existing.tier;
  const userTier = deriveTierForUsers(status, tier);

  // In Stripe v17, current_period is on SubscriptionItem, not Subscription
  const item = sub.items.data[0];
  const periodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000)
    : existing.current_period_start ?? new Date();
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : existing.current_period_end ?? new Date();

  await subscriptionRepo.syncTierTransaction(pool, existing.user_id, sub.id, {
    tier,
    stripe_customer_id: existing.stripe_customer_id ?? '',
    status,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: sub.cancel_at_period_end,
  }, userTier);
}

async function onSubscriptionDeleted(
  pool: pg.Pool,
  sub: Stripe.Subscription,
): Promise<void> {
  const existing = await subscriptionRepo.findByStripeSubscriptionId(pool, sub.id);
  if (!existing) return;

  await subscriptionRepo.syncTierTransaction(pool, existing.user_id, sub.id, {
    tier: existing.tier,
    stripe_customer_id: existing.stripe_customer_id ?? '',
    status: 'cancelled',
    current_period_start: existing.current_period_start ?? new Date(),
    current_period_end: existing.current_period_end ?? new Date(),
  }, 'free');
}

async function onPaymentFailed(
  pool: pg.Pool,
  invoice: Stripe.Invoice,
): Promise<void> {
  // In Stripe v17, subscription is accessed via invoice.parent.subscription_details
  const parentDetails = invoice.parent;
  const stripeSubId =
    parentDetails?.type === 'subscription_details'
      ? (typeof parentDetails.subscription_details?.subscription === 'string'
          ? parentDetails.subscription_details.subscription
          : parentDetails.subscription_details?.subscription.id)
      : undefined;
  if (!stripeSubId) return;

  await subscriptionRepo.updateByStripeId(pool, stripeSubId, {
    status: 'past_due',
  });
}
