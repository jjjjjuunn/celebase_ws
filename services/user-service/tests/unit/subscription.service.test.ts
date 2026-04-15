import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type pg from 'pg';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFindByUserId = jest.fn();
const mockFindByStripeSubscriptionId = jest.fn();
const mockUpdateByStripeId = jest.fn();
const mockSyncTierTransaction = jest.fn();

jest.unstable_mockModule('../../src/repositories/subscription.repository.js', () => ({
  findByUserId: mockFindByUserId,
  findByStripeSubscriptionId: mockFindByStripeSubscriptionId,
  updateByStripeId: mockUpdateByStripeId,
  syncTierTransaction: mockSyncTierTransaction,
}));

const {
  createCheckoutSession,
  getMySubscription,
  cancelSubscription,
  handleWebhookEvent,
} = await import('../../src/services/subscription.service.js');
const { NotFoundError, ValidationError } = await import('@celebbase/service-core');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockPool = {} as pg.Pool;

const baseSubscription = {
  id: 'sub-uuid-1',
  user_id: 'user-uuid-1',
  tier: 'premium' as const,
  stripe_subscription_id: 'sub_stripe_123',
  stripe_customer_id: 'cus_stripe_456',
  status: 'active' as const,
  current_period_start: new Date('2026-04-01'),
  current_period_end: new Date('2026-05-01'),
  cancel_at_period_end: false,
  quota_override: {},
  created_at: new Date(),
  updated_at: new Date(),
};

const mockStripeCheckoutCreate = jest.fn();
const mockStripeSubscriptionsUpdate = jest.fn();
const mockStripeWebhooksConstructEvent = jest.fn();

const mockStripeConfig = {
  stripe: {
    checkout: { sessions: { create: mockStripeCheckoutCreate } },
    subscriptions: { update: mockStripeSubscriptionsUpdate },
    webhooks: { constructEvent: mockStripeWebhooksConstructEvent },
  } as unknown,
  premiumPriceId: 'price_premium_123',
  elitePriceId: 'price_elite_456',
  webhookSecret: 'whsec_test_secret',
  successUrl: 'https://app.celebbase.com/subscription/success',
  cancelUrl: 'https://app.celebbase.com/subscription/cancel',
} as Parameters<typeof createCheckoutSession>[1];

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createCheckoutSession
// ---------------------------------------------------------------------------

describe('createCheckoutSession', () => {
  it('returns checkout_url on success', async () => {
    mockFindByUserId.mockResolvedValueOnce(null);
    mockStripeCheckoutCreate.mockResolvedValueOnce({
      url: 'https://checkout.stripe.com/session_abc',
    });

    const result = await createCheckoutSession(
      mockPool,
      mockStripeConfig,
      'user-uuid-1',
      'premium',
    );

    expect(result.checkout_url).toBe('https://checkout.stripe.com/session_abc');
    expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        client_reference_id: 'user-uuid-1',
        line_items: [{ price: 'price_premium_123', quantity: 1 }],
        success_url: 'https://app.celebbase.com/subscription/success',
        cancel_url: 'https://app.celebbase.com/subscription/cancel',
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it('uses elite price ID for elite tier', async () => {
    mockFindByUserId.mockResolvedValueOnce(null);
    mockStripeCheckoutCreate.mockResolvedValueOnce({
      url: 'https://checkout.stripe.com/session_elite',
    });

    await createCheckoutSession(mockPool, mockStripeConfig, 'user-uuid-1', 'elite');

    expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_elite_456', quantity: 1 }],
      }),
      expect.any(Object),
    );
  });

  it('throws ValidationError if user already has active subscription', async () => {
    mockFindByUserId.mockResolvedValueOnce(baseSubscription);

    await expect(
      createCheckoutSession(mockPool, mockStripeConfig, 'user-uuid-1', 'premium'),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError if user has past_due subscription', async () => {
    mockFindByUserId.mockResolvedValueOnce({ ...baseSubscription, status: 'past_due' });

    await expect(
      createCheckoutSession(mockPool, mockStripeConfig, 'user-uuid-1', 'premium'),
    ).rejects.toThrow(ValidationError);
  });
});

// ---------------------------------------------------------------------------
// getMySubscription
// ---------------------------------------------------------------------------

describe('getMySubscription', () => {
  it('returns subscription when found', async () => {
    mockFindByUserId.mockResolvedValueOnce(baseSubscription);

    const result = await getMySubscription(mockPool, 'user-uuid-1');
    expect(result).toEqual(baseSubscription);
  });

  it('returns null for free tier user', async () => {
    mockFindByUserId.mockResolvedValueOnce(null);

    const result = await getMySubscription(mockPool, 'user-uuid-1');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cancelSubscription
// ---------------------------------------------------------------------------

describe('cancelSubscription', () => {
  it('calls Stripe API and returns cancel_requested', async () => {
    mockFindByUserId.mockResolvedValueOnce(baseSubscription);
    mockStripeSubscriptionsUpdate.mockResolvedValueOnce({});

    const result = await cancelSubscription(mockPool, mockStripeConfig, 'user-uuid-1');

    expect(result).toEqual({ cancel_requested: true, cancel_at_period_end: true });
    expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
      'sub_stripe_123',
      { cancel_at_period_end: true },
    );
  });

  it('throws NotFoundError when no active subscription', async () => {
    mockFindByUserId.mockResolvedValueOnce(null);

    await expect(
      cancelSubscription(mockPool, mockStripeConfig, 'user-uuid-1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when subscription is cancelled', async () => {
    mockFindByUserId.mockResolvedValueOnce({ ...baseSubscription, status: 'cancelled' });

    await expect(
      cancelSubscription(mockPool, mockStripeConfig, 'user-uuid-1'),
    ).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// handleWebhookEvent
// ---------------------------------------------------------------------------

describe('handleWebhookEvent', () => {
  it('processes checkout.session.completed', async () => {
    mockSyncTierTransaction.mockResolvedValueOnce(undefined);

    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          client_reference_id: 'user-uuid-1',
          subscription: 'sub_stripe_new',
          customer: 'cus_stripe_new',
          metadata: { tier: 'premium', user_id: 'user-uuid-1' },
        },
      },
    };

    await handleWebhookEvent(mockPool, event as never, mockStripeConfig);

    expect(mockSyncTierTransaction).toHaveBeenCalledWith(
      mockPool,
      'user-uuid-1',
      'sub_stripe_new',
      expect.objectContaining({
        tier: 'premium',
        stripe_customer_id: 'cus_stripe_new',
        status: 'active',
      }),
      'premium',
    );
  });

  it('processes customer.subscription.updated', async () => {
    mockFindByStripeSubscriptionId.mockResolvedValueOnce(baseSubscription);
    mockSyncTierTransaction.mockResolvedValueOnce(undefined);

    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_123',
          status: 'active',
          cancel_at_period_end: true,
          items: {
            data: [{
              price: { id: 'price_premium_123' },
              current_period_start: 1714521600,
              current_period_end: 1717200000,
            }],
          },
        },
      },
    };

    await handleWebhookEvent(mockPool, event as never, mockStripeConfig);

    expect(mockSyncTierTransaction).toHaveBeenCalledWith(
      mockPool,
      'user-uuid-1',
      'sub_stripe_123',
      expect.objectContaining({
        tier: 'premium',
        status: 'active',
        cancel_at_period_end: true,
      }),
      'premium',
    );
  });

  it('processes customer.subscription.deleted — sets tier to free', async () => {
    mockFindByStripeSubscriptionId.mockResolvedValueOnce(baseSubscription);
    mockSyncTierTransaction.mockResolvedValueOnce(undefined);

    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_stripe_123',
          status: 'canceled',
        },
      },
    };

    await handleWebhookEvent(mockPool, event as never, mockStripeConfig);

    expect(mockSyncTierTransaction).toHaveBeenCalledWith(
      mockPool,
      'user-uuid-1',
      'sub_stripe_123',
      expect.objectContaining({ status: 'cancelled' }),
      'free',
    );
  });

  it('processes invoice.payment_failed — sets status to past_due', async () => {
    mockUpdateByStripeId.mockResolvedValueOnce(baseSubscription);

    const event = {
      type: 'invoice.payment_failed',
      data: {
        object: {
          parent: {
            type: 'subscription_details',
            subscription_details: {
              subscription: 'sub_stripe_123',
            },
          },
        },
      },
    };

    await handleWebhookEvent(mockPool, event as never, mockStripeConfig);

    expect(mockUpdateByStripeId).toHaveBeenCalledWith(
      mockPool,
      'sub_stripe_123',
      { status: 'past_due' },
    );
  });

  it('ignores unknown event types without error', async () => {
    const event = {
      type: 'some.unknown.event',
      data: { object: {} },
    };

    // Should not throw
    await handleWebhookEvent(mockPool, event as never, mockStripeConfig);
  });

  it('skips checkout.session.completed for non-subscription mode', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'payment', // one-time payment, not subscription
          client_reference_id: 'user-uuid-1',
        },
      },
    };

    await handleWebhookEvent(mockPool, event as never, mockStripeConfig);

    expect(mockSyncTierTransaction).not.toHaveBeenCalled();
  });

  it('skips subscription.updated when no existing record found', async () => {
    mockFindByStripeSubscriptionId.mockResolvedValueOnce(null);

    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_orphaned',
          status: 'active',
          items: { data: [{ price: { id: 'price_premium_123' }, current_period_start: 0, current_period_end: 0 }] },
        },
      },
    };

    await handleWebhookEvent(mockPool, event as never, mockStripeConfig);

    expect(mockSyncTierTransaction).not.toHaveBeenCalled();
  });

  it('throws on unknown Stripe subscription status', async () => {
    mockFindByStripeSubscriptionId.mockResolvedValueOnce(baseSubscription);

    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_123',
          status: 'some_future_status',
          cancel_at_period_end: false,
          items: {
            data: [{
              price: { id: 'price_premium_123' },
              current_period_start: 1714521600,
              current_period_end: 1717200000,
            }],
          },
        },
      },
    };

    await expect(
      handleWebhookEvent(mockPool, event as never, mockStripeConfig),
    ).rejects.toThrow('Unknown Stripe subscription status: some_future_status');
  });

  it('throws on unknown Stripe price ID in subscription.updated', async () => {
    mockFindByStripeSubscriptionId.mockResolvedValueOnce(baseSubscription);

    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_123',
          status: 'active',
          cancel_at_period_end: false,
          items: {
            data: [{
              price: { id: 'price_unknown_999' },
              current_period_start: 1714521600,
              current_period_end: 1717200000,
            }],
          },
        },
      },
    };

    await expect(
      handleWebhookEvent(mockPool, event as never, mockStripeConfig),
    ).rejects.toThrow('Unknown Stripe price ID: price_unknown_999');
  });

  it('checkout.session.completed uses deterministic period (epoch 0)', async () => {
    mockSyncTierTransaction.mockResolvedValueOnce(undefined);

    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          client_reference_id: 'user-uuid-1',
          subscription: 'sub_stripe_new',
          customer: 'cus_stripe_new',
          metadata: { tier: 'premium', user_id: 'user-uuid-1' },
        },
      },
    };

    await handleWebhookEvent(mockPool, event as never, mockStripeConfig);

    expect(mockSyncTierTransaction).toHaveBeenCalledWith(
      mockPool,
      'user-uuid-1',
      'sub_stripe_new',
      expect.objectContaining({
        current_period_start: new Date(0),
        current_period_end: new Date(0),
      }),
      'premium',
    );
  });
});

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

describe('circuit breaker', () => {
  it('opens after 5 consecutive Stripe failures and rejects calls', async () => {
    mockFindByUserId.mockResolvedValue(null);
    mockStripeCheckoutCreate.mockRejectedValue(new Error('Stripe down'));

    // Trip the breaker with 5 failures
    for (let i = 0; i < 5; i++) {
      await expect(
        createCheckoutSession(mockPool, mockStripeConfig, `user-${i}`, 'premium'),
      ).rejects.toThrow('Stripe down');
    }

    // 6th call should be blocked by the open breaker
    await expect(
      createCheckoutSession(mockPool, mockStripeConfig, 'user-6', 'premium'),
    ).rejects.toThrow('Stripe circuit breaker is open');

    expect(mockStripeCheckoutCreate).toHaveBeenCalledTimes(5);
  });
});
