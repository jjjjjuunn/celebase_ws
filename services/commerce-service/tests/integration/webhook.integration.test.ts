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
  const mockQuery = jest.fn<() => Promise<{ rows: unknown[]; rowCount: number }>>().mockResolvedValue({
    rows: overrides.rows ?? [],
    rowCount: overrides.rowCount ?? 1,
  });
  return { query: mockQuery } as unknown as pg.Pool;
}

describe('processedEventsRepo.markProcessed — idempotency semantics', () => {
  it('returns { inserted: true } when rowCount is 1 (first occurrence)', async () => {
    const pool = makeMockPool({ rowCount: 1 });
    const result = await markProcessed(pool, {
      stripeEventId: checkoutSessionCompleted.stripe_event_id,
      eventType: checkoutSessionCompleted.type,
      payloadHash: 'a'.repeat(64),
      result: 'applied',
    });
    expect(result.inserted).toBe(true);
  });

  it('returns { inserted: false } when rowCount is 0 (duplicate — ON CONFLICT DO NOTHING)', async () => {
    const pool = makeMockPool({ rowCount: 0 });
    const result = await markProcessed(pool, {
      stripeEventId: checkoutSessionCompleted.stripe_event_id,
      eventType: checkoutSessionCompleted.type,
      payloadHash: 'a'.repeat(64),
      result: 'applied',
    });
    expect(result.inserted).toBe(false);
  });
});

describe('processedEventsRepo.findByEventId', () => {
  it('returns null when event not found', async () => {
    const pool = makeMockPool({ rows: [] });
    const result = await findByEventId(pool, 'nonexistent-id');
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
    };
    const pool = makeMockPool({ rows: [existingRow] });
    const result = await findByEventId(pool, checkoutSessionCompleted.stripe_event_id);
    expect(result).toEqual(existingRow);
  });
});

describe('Stripe webhook idempotency flow', () => {
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

  it('skips processing on second occurrence (replay_skipped)', async () => {
    const pool = makeMockPool({ rowCount: 0 });

    const { inserted } = await markProcessed(pool, {
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

  it('overlap scenario: user-service pre-empts commerce-service (rowCount 0 → skip)', async () => {
    const pool = makeMockPool({ rowCount: 0 });

    const { inserted } = await markProcessed(pool, {
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
