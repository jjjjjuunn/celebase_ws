import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';

const mockFindTierByUserId = jest.fn<() => Promise<{ tier: string }>>();
const mockFindSubscriptionStateByUserId =
  jest.fn<() => Promise<{ tier: string; bioCreatedAt: Date | null }>>();

jest.unstable_mockModule('../../src/repositories/subscription.repository.js', () => ({
  findTierByUserId: mockFindTierByUserId,
  findSubscriptionStateByUserId: mockFindSubscriptionStateByUserId,
}));

const { subscriptionRoutes } = await import('../../src/routes/subscription.routes.js');

const MOCK_USER_ID = 'test-user-id';

function makeApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorateRequest('userId', MOCK_USER_ID);
  const pool = {} as pg.Pool;
  void app.register(subscriptionRoutes, { pool });
  return app;
}

describe('GET /subscriptions/me', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = makeApp();
    // Paid tier: no trial regardless of bio-profile presence.
    mockFindSubscriptionStateByUserId.mockResolvedValue({
      tier: 'premium',
      bioCreatedAt: null,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns tier + trial fields for a paid (non-trial) user', async () => {
    const res = await app.inject({ method: 'GET', url: '/subscriptions/me' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      tier: 'premium',
      trial_active: false,
      trial_ends_at: null,
    });
  });

  it('marks free-tier user as trial_active within the trial window', async () => {
    mockFindSubscriptionStateByUserId.mockResolvedValue({
      tier: 'free',
      bioCreatedAt: new Date(), // just onboarded
    });
    const res = await app.inject({ method: 'GET', url: '/subscriptions/me' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      tier: string;
      trial_active: boolean;
      trial_ends_at: string | null;
    };
    expect(body.tier).toBe('free');
    expect(body.trial_active).toBe(true);
    expect(body.trial_ends_at).not.toBeNull();
  });

  it('expires the trial for a free-tier user past the window', async () => {
    mockFindSubscriptionStateByUserId.mockResolvedValue({
      tier: 'free',
      bioCreatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
    });
    const res = await app.inject({ method: 'GET', url: '/subscriptions/me' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ tier: 'free', trial_active: false });
  });

  it('reports no trial for a free-tier user who has not onboarded', async () => {
    mockFindSubscriptionStateByUserId.mockResolvedValue({
      tier: 'free',
      bioCreatedAt: null,
    });
    const res = await app.inject({ method: 'GET', url: '/subscriptions/me' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      tier: 'free',
      trial_active: false,
      trial_ends_at: null,
    });
  });
});

describe('Removed Stripe routes are absent', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /subscriptions returns 404 (commerce-service owns checkout)', async () => {
    const res = await app.inject({ method: 'POST', url: '/subscriptions', body: '{}' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /webhooks/stripe returns 404 (commerce-service owns webhook)', async () => {
    const res = await app.inject({ method: 'POST', url: '/webhooks/stripe', body: '{}' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /subscriptions/me/cancel returns 404 (commerce-service owns cancellation)', async () => {
    const res = await app.inject({ method: 'POST', url: '/subscriptions/me/cancel', body: '{}' });
    expect(res.statusCode).toBe(404);
  });
});
