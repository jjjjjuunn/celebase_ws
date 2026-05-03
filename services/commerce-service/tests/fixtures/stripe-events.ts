export const checkoutSessionCompleted = {
  id: '01957b2c-0000-7000-a000-aabbcc000001',
  stripe_event_id: '01957b2c-0000-7000-a000-aabbcc000001',
  type: 'checkout.session.completed',
  created: 1745000000,
  data: {
    object: {
      id: 'cs_test_fixture_001',
      object: 'checkout.session',
      customer: 'cus_fixture_001',
      subscription: 'sub_fixture_001',
      payment_status: 'paid',
      metadata: {
        userId: 'user-fixture-uuid-0001',
        tier: 'premium',
      },
    },
  },
};

export const subscriptionUpdated = {
  id: '01957b2c-0000-7000-a000-aabbcc000002',
  stripe_event_id: '01957b2c-0000-7000-a000-aabbcc000002',
  type: 'customer.subscription.updated',
  created: 1745000100,
  data: {
    object: {
      id: 'sub_fixture_001',
      object: 'subscription',
      customer: 'cus_fixture_001',
      status: 'active',
      current_period_start: 1745000000,
      current_period_end: 1747678400,
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: {
              metadata: {
                tier: 'premium',
              },
            },
          },
        ],
      },
    },
  },
};

export const invoicePaymentFailed = {
  id: '01957b2c-0000-7000-a000-aabbcc000003',
  stripe_event_id: '01957b2c-0000-7000-a000-aabbcc000003',
  type: 'invoice.payment_failed',
  created: 1745000200,
  data: {
    object: {
      id: 'in_fixture_001',
      object: 'invoice',
      subscription: 'sub_fixture_001',
      customer: 'cus_fixture_001',
      payment_intent: 'pi_fixture_001',
      amount_due: 1999,
      currency: 'usd',
    },
  },
};
