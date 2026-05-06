import { jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import { markProcessed, findByEventId } from '../../src/repositories/processed-events.repository.js';
import {
  checkoutSessionCompleted,
  subscriptionUpdated,
  invoicePaymentFailed,
} from '../fixtures/stripe-events.js';
import type pg from 'pg';

function makeMockPool(overrides: { rowCount?: number; rows?: unknown[] } = {}): pg.Pool {
  const mockQuery = jest
    .fn<() => Promise<{ rows: unknown[]; rowCount: number }>>()
    .mockResolvedValue({
      rows: overrides.rows ?? [],
      rowCount: overrides.rowCount ?? 1,
    });
  return { query: mockQuery } as unknown as pg.Pool;
}

describe('markProcessed — idempotency semantics', () => {
  it('returns { inserted: true } when rowCount is 1 (first occurrence)', async () => {
    const pool = makeMockPool({ rowCount: 1 });
    const result = await markProcessed(pool, {
      provider: 'stripe',
      eventId: checkoutSessionCompleted.stripe_event_id,
      stripeEventId: checkoutSessionCompleted.stripe_event_id,
      eventType: checkoutSessionCompleted.type,
      payloadHash: 'a'.repeat(64),
      result: 'applied',
    });
    expect(result.inserted).toBe(true);
  });

  it('returns { inserted: false } when rowCount is 0 (duplicate)', async () => {
    const pool = makeMockPool({ rowCount: 0 });
    const result = await markProcessed(pool, {
      provider: 'stripe',
      eventId: checkoutSessionCompleted.stripe_event_id,
      stripeEventId: checkoutSessionCompleted.stripe_event_id,
      eventType: checkoutSessionCompleted.type,
      payloadHash: 'a'.repeat(64),
      result: 'applied',
    });
    expect(result.inserted).toBe(false);
  });
});

describe('findByEventId (legacy stripeEventId param)', () => {
  it('returns null when event not found', async () => {
    const pool = makeMockPool({ rows: [] });
    const result = await findByEventId(pool, { stripeEventId: 'nonexistent-id' });
    expect(result).toBeNull();
  });

  it('returns the event row when found', async () => {
    const existingRow = {
      id: 'row-id',
      stripe_event_id: checkoutSessionCompleted.stripe_event_id,
      event_type: checkoutSessionCompleted.type,
      processed_at: new Date(),
      payload_hash: 'b'.repeat(64),
      result: 'applied' as const,
      error_message: null,
      provider: null,
      event_id: null,
    } as unknown;
    const pool = makeMockPool({ rows: [existingRow] });
    const result = await findByEventId(pool, {
      stripeEventId: checkoutSessionCompleted.stripe_event_id,
    });
    expect(result).toEqual(existingRow);
  });
});

describe('markProcessed — dual-write to provider/event_id columns', () => {
  it('INSERT statement includes provider and event_id columns', async () => {
    const queryFn = jest
      .fn<() => Promise<{ rows: unknown[]; rowCount: number }>>()
      .mockResolvedValue({ rows: [], rowCount: 1 });
    const pool = { query: queryFn } as unknown as pg.Pool;

    await markProcessed(pool, {
      provider: 'stripe',
      eventId: 'evt_123',
      stripeEventId: 'evt_123',
      eventType: 'checkout.session.completed',
      payloadHash: 'a'.repeat(64),
      result: 'applied',
    });

    expect(queryFn).toHaveBeenCalledTimes(1);
    const [sql, values] = queryFn.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO processed_events/);
    expect(sql).toMatch(/provider/);
    expect(sql).toMatch(/event_id/);
    expect(sql).toMatch(/ON CONFLICT \(stripe_event_id\) DO NOTHING/);
    expect(values).toHaveLength(7);
    expect(values).toContain('stripe');
    expect(values).toContain('evt_123');
  });

  it('passes provider and eventId values to query parameters', async () => {
    const queryFn = jest
      .fn<() => Promise<{ rows: unknown[]; rowCount: number }>>()
      .mockResolvedValue({ rows: [], rowCount: 1 });
    const pool = { query: queryFn } as unknown as pg.Pool;

    await markProcessed(pool, {
      provider: 'stripe',
      eventId: 'evt_456',
      stripeEventId: 'evt_456',
      eventType: 'invoice.payment_failed',
      payloadHash: 'b'.repeat(64),
      result: 'applied',
    });

    const [, values] = queryFn.mock.calls[0] as [string, unknown[]];
    expect(values[0]).toBe('evt_456'); // stripe_event_id
    expect(values[5]).toBe('stripe'); // provider
    expect(values[6]).toBe('evt_456'); // event_id
  });
});

describe('findByEventId — new provider+eventId signature', () => {
  it('queries provider AND event_id when called with { provider, eventId }', async () => {
    const queryFn = jest
      .fn<() => Promise<{ rows: unknown[]; rowCount: number }>>()
      .mockResolvedValue({ rows: [], rowCount: 0 });
    const pool = { query: queryFn } as unknown as pg.Pool;

    await findByEventId(pool, { provider: 'stripe', eventId: 'evt_xyz' });

    const [sql, values] = queryFn.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE provider = \$1 AND event_id = \$2/);
    expect(values).toEqual(['stripe', 'evt_xyz']);
  });

  it('falls back to stripe_event_id lookup for stripe provider when new columns miss', async () => {
    const queryFn = jest
      .fn<() => Promise<{ rows: unknown[]; rowCount: number }>>();
    queryFn.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // first call miss
    queryFn.mockResolvedValueOnce({
      rows: [
        {
          id: 'r1',
          stripe_event_id: 'evt_old',
          provider: null,
          event_id: null,
        } as unknown,
      ],
      rowCount: 1,
    });
    const pool = { query: queryFn } as unknown as pg.Pool;

    const result = await findByEventId(pool, { provider: 'stripe', eventId: 'evt_old' });

    expect(queryFn).toHaveBeenCalledTimes(2);
    const [sql2] = queryFn.mock.calls[1] as [string, unknown[]];
    expect(sql2).toMatch(/WHERE stripe_event_id = \$1/);
    expect(result).not.toBeNull();
  });

  it('does NOT fallback for revenuecat provider', async () => {
    const queryFn = jest
      .fn<() => Promise<{ rows: unknown[]; rowCount: number }>>()
      .mockResolvedValue({ rows: [], rowCount: 0 });
    const pool = { query: queryFn } as unknown as pg.Pool;

    const result = await findByEventId(pool, { provider: 'revenuecat', eventId: 'rc_evt_1' });

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });
});

describe('Stripe webhook idempotency flow (updated params)', () => {
  const webhookHandled: string[] = [];

  function simulateWebhookDispatch(stripeEventId: string, inserted: boolean): void {
    if (inserted) {
      webhookHandled.push(stripeEventId);
    }
  }

  beforeEach(() => {
    webhookHandled.length = 0;
  });

  it('processes checkout.session.completed on first occurrence', async () => {
    const pool = makeMockPool({ rowCount: 1 });

    const { inserted } = await markProcessed(pool, {
      provider: 'stripe',
      eventId: checkoutSessionCompleted.stripe_event_id,
      stripeEventId: checkoutSessionCompleted.stripe_event_id,
      eventType: checkoutSessionCompleted.type,
      payloadHash: createHash('sha256')
        .update(JSON.stringify(checkoutSessionCompleted.data.object))
        .digest('hex'),
      result: 'applied',
    });

    simulateWebhookDispatch(checkoutSessionCompleted.stripe_event_id, inserted);

    expect(inserted).toBe(true);
    expect(webhookHandled).toContain(checkoutSessionCompleted.stripe_event_id);
  });

  it('skips processing on second occurrence', async () => {
    const pool = makeMockPool({ rowCount: 0 });

    const { inserted } = await markProcessed(pool, {
      provider: 'stripe',
      eventId: checkoutSessionCompleted.stripe_event_id,
      stripeEventId: checkoutSessionCompleted.stripe_event_id,
      eventType: checkoutSessionCompleted.type,
      payloadHash: createHash('sha256')
        .update(JSON.stringify(checkoutSessionCompleted.data.object))
        .digest('hex'),
      result: 'applied',
    });

    simulateWebhookDispatch(checkoutSessionCompleted.stripe_event_id, inserted);

    expect(inserted).toBe(false);
    expect(webhookHandled).not.toContain(checkoutSessionCompleted.stripe_event_id);
  });

  it('overlap scenario: user-service pre-empts commerce-service', async () => {
    const pool = makeMockPool({ rowCount: 0 });

    const { inserted } = await markProcessed(pool, {
      provider: 'stripe',
      eventId: subscriptionUpdated.stripe_event_id,
      stripeEventId: subscriptionUpdated.stripe_event_id,
      eventType: subscriptionUpdated.type,
      payloadHash: createHash('sha256')
        .update(JSON.stringify(subscriptionUpdated.data.object))
        .digest('hex'),
      result: 'applied',
    });

    simulateWebhookDispatch(subscriptionUpdated.stripe_event_id, inserted);

    expect(inserted).toBe(false);
    expect(webhookHandled).not.toContain(subscriptionUpdated.stripe_event_id);
  });

  it('processes invoice.payment_failed on first occurrence', async () => {
    const pool = makeMockPool({ rowCount: 1 });

    const { inserted } = await markProcessed(pool, {
      provider: 'stripe',
      eventId: invoicePaymentFailed.stripe_event_id,
      stripeEventId: invoicePaymentFailed.stripe_event_id,
      eventType: invoicePaymentFailed.type,
      payloadHash: createHash('sha256')
        .update(JSON.stringify(invoicePaymentFailed.data.object))
        .digest('hex'),
      result: 'applied',
    });

    simulateWebhookDispatch(invoicePaymentFailed.stripe_event_id, inserted);

    expect(inserted).toBe(true);
    expect(webhookHandled).toContain(invoicePaymentFailed.stripe_event_id);
  });
});
