import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';

const mockFindTierByUserId = jest.fn<() => Promise<{ tier: string }>>();

jest.unstable_mockModule('../../src/repositories/subscription.repository.js', () => ({
  findTierByUserId: mockFindTierByUserId,
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
    mockFindTierByUserId.mockResolvedValue({ tier: 'premium' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns { tier } for authenticated user', async () => {
    const res = await app.inject({ method: 'GET', url: '/subscriptions/me' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ tier: 'premium' });
  });

  it('returns free tier when findTierByUserId returns free', async () => {
    mockFindTierByUserId.mockResolvedValue({ tier: 'free' });
    const res = await app.inject({ method: 'GET', url: '/subscriptions/me' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ tier: 'free' });
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
