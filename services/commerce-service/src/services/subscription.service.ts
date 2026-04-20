import type pg from 'pg';
import type Stripe from 'stripe';
import { NotFoundError, ValidationError } from '@celebbase/service-core';
import * as subscriptionRepo from '../repositories/subscription.repository.js';
import type { UserServiceClient } from './user-service.client.js';

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

async function markSubscriptionPastDue(
  pool: pg.Pool,
  stripeSubId: string,
): Promise<void> {
  await pool.query(
    `UPDATE subscriptions SET status = 'past_due', updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [stripeSubId],
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createCheckoutSession(
  pool: pg.Pool,
  config: StripeConfig,
  userId: string,
  tier: 'premium' | 'elite',
  idempotencyKey: string,
): Promise<{ checkout_url: string }> {
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
      { idempotencyKey },
    ),
  );

  if (!session.url) {
    throw new Error('Stripe Checkout Session did not return a URL');
  }

  return { checkout_url: session.url };
}

export async function getMySubscription(
  pool: pg.Pool,
  userId: string,
) {
  return subscriptionRepo.findByUserId(pool, userId);
}

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

  return { cancel_requested: true, cancel_at_period_end: true };
}

// ---------------------------------------------------------------------------
// Webhook event handlers
// ---------------------------------------------------------------------------

export async function handleWebhookEvent(
  pool: pg.Pool,
  event: Stripe.Event,
  config: StripeConfig,
  userClient: UserServiceClient,
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await onCheckoutCompleted(pool, event.data.object, userClient);
      break;
    case 'customer.subscription.updated':
      await onSubscriptionChanged(pool, event.data.object, config, userClient);
      break;
    case 'customer.subscription.deleted':
      await onSubscriptionDeleted(pool, event.data.object, userClient);
      break;
    case 'invoice.payment_failed':
      await onPaymentFailed(pool, event.data.object);
      break;
    default:
      break;
  }
}

async function onCheckoutCompleted(
  pool: pg.Pool,
  session: Stripe.Checkout.Session,
  userClient: UserServiceClient,
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

  const tier = session.metadata?.tier === 'elite' ? 'elite' : 'premium';
  const periodStart = new Date(0);
  const periodEnd = new Date(0);
  const status = mapStripeStatus('active');
  const userTier = deriveTierForUsers(status, tier);

  await subscriptionRepo.upsertSubscription(pool, {
    userId,
    stripeSubscriptionId,
    stripeCustomerId,
    tier,
    status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
  });

  await userClient.syncTier(userId, userTier, {
    idempotencyKey: `${userId}:${userTier}:${stripeSubscriptionId}`,
  });
}

async function onSubscriptionChanged(
  pool: pg.Pool,
  sub: Stripe.Subscription,
  config: StripeConfig,
  userClient: UserServiceClient,
): Promise<void> {
  const existing = await subscriptionRepo.findByStripeSubscriptionId(pool, sub.id);
  if (!existing) return;

  const status = mapStripeStatus(sub.status);
  const priceId = sub.items.data[0]?.price.id;
  const tier = priceId ? tierFromPriceId(priceId, config) : existing.tier;
  const userTier = deriveTierForUsers(status, tier);

  const item = sub.items.data[0];
  const periodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000)
    : existing.current_period_start ?? new Date();
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : existing.current_period_end ?? new Date();

  await subscriptionRepo.upsertSubscription(pool, {
    userId: existing.user_id,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: existing.stripe_customer_id ?? '',
    tier,
    status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  });

  await userClient.syncTier(existing.user_id, userTier, {
    idempotencyKey: `${existing.user_id}:${userTier}:${sub.id}`,
  });
}

async function onSubscriptionDeleted(
  pool: pg.Pool,
  sub: Stripe.Subscription,
  userClient: UserServiceClient,
): Promise<void> {
  const existing = await subscriptionRepo.findByStripeSubscriptionId(pool, sub.id);
  if (!existing) return;

  await subscriptionRepo.upsertSubscription(pool, {
    userId: existing.user_id,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: existing.stripe_customer_id ?? '',
    tier: existing.tier,
    status: 'cancelled',
    currentPeriodStart: existing.current_period_start ?? new Date(),
    currentPeriodEnd: existing.current_period_end ?? new Date(),
  });

  await userClient.syncTier(existing.user_id, 'free', {
    idempotencyKey: `${existing.user_id}:free:${sub.id}`,
  });
}

async function onPaymentFailed(
  pool: pg.Pool,
  invoice: Stripe.Invoice,
): Promise<void> {
  const parentDetails = invoice.parent;
  const stripeSubId =
    parentDetails?.type === 'subscription_details'
      ? (typeof parentDetails.subscription_details?.subscription === 'string'
          ? parentDetails.subscription_details.subscription
          : parentDetails.subscription_details?.subscription.id)
      : undefined;
  if (!stripeSubId) return;

  await markSubscriptionPastDue(pool, stripeSubId);
}
