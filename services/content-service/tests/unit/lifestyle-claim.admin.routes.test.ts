import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type pg from 'pg';

const mockListForModeration = jest.fn();
const mockFindByIdAdmin = jest.fn();
const mockTransitionStatus = jest.fn();
const mockSetHealthClaim = jest.fn();

jest.unstable_mockModule('../../src/repositories/lifestyle-claim.repository.js', () => ({
  listForModeration: mockListForModeration,
  findByIdAdmin: mockFindByIdAdmin,
  transitionStatus: mockTransitionStatus,
  setHealthClaim: mockSetHealthClaim,
}));

const { lifestyleClaimAdminRoutes } = await import(
  '../../src/routes/admin/lifestyle-claim.admin.routes.js'
);
const { registerAdminAuth } = await import('../../src/middleware/admin-auth.js');
const { AppError } = await import('@celebbase/service-core');
const Fastify = (await import('fastify')).default;

const baseClaim = {
  id: '11111111-1111-7111-8111-111111111111',
  celebrity_id: '99999999-9999-7999-8999-999999999999',
  claim_type: 'food' as const,
  headline: 'Loves matcha',
  body: null,
  trust_grade: 'B' as const,
  primary_source_url: 'https://vogue.com/article/123',
  verified_by: null,
  last_verified_at: new Date('2026-01-01T00:00:00Z'),
  is_health_claim: false,
  disclaimer_key: null,
  base_diet_id: null,
  tags: ['drink'],
  status: 'draft' as const,
  published_at: null,
  is_active: true,
  created_at: new Date('2026-01-15T00:00:00Z'),
  updated_at: new Date('2026-02-01T00:00:00Z'),
};

const mockPool = {} as pg.Pool;

const VALID_TOKEN = 'test-admin-token-abc';

async function makeApp(opts?: { withToken?: boolean }): Promise<ReturnType<typeof Fastify>> {
  if (opts?.withToken) {
    process.env['ADMIN_API_TOKEN'] = VALID_TOKEN;
    process.env['NODE_ENV'] = 'development';
  } else {
    delete process.env['ADMIN_API_TOKEN'];
    process.env['NODE_ENV'] = 'development';
  }

  const app = Fastify({ logger: false });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      void reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId: request.id,
        },
      });
      return;
    }
    void reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        requestId: request.id,
      },
    });
  });
  registerAdminAuth(app);
  await app.register(lifestyleClaimAdminRoutes, { pool: mockPool });
  await app.ready();
  return app;
}

beforeEach(() => {
  mockListForModeration.mockReset();
  mockFindByIdAdmin.mockReset();
  mockTransitionStatus.mockReset();
  mockSetHealthClaim.mockReset();
});

describe('Admin auth — X-Admin-Token guard', () => {
  it('rejects requests without X-Admin-Token when token is set', async () => {
    const app = await makeApp({ withToken: true });
    const res = await app.inject({ method: 'GET', url: '/admin/claims' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    expect(mockListForModeration).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects requests with wrong token', async () => {
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/claims',
      headers: { 'x-admin-token': 'wrong-token' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    expect(mockListForModeration).not.toHaveBeenCalled();
    await app.close();
  });

  it('allows requests with correct token', async () => {
    mockListForModeration.mockResolvedValue({ items: [], next_cursor: null, has_next: false });
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/claims',
      headers: { 'x-admin-token': VALID_TOKEN },
    });
    expect(res.statusCode).toBe(200);
    expect(mockListForModeration).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('passes in stub mode (dev) when ADMIN_API_TOKEN is unset', async () => {
    mockListForModeration.mockResolvedValue({ items: [], next_cursor: null, has_next: false });
    const app = await makeApp({ withToken: false });
    const res = await app.inject({ method: 'GET', url: '/admin/claims' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /admin/claims', () => {
  it('forwards filters to repository', async () => {
    mockListForModeration.mockResolvedValue({ items: [], next_cursor: null, has_next: false });
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/claims?status=draft&claim_type=food&trust_grade=B&limit=10',
      headers: { 'x-admin-token': VALID_TOKEN },
    });
    expect(res.statusCode).toBe(200);
    expect(mockListForModeration).toHaveBeenCalledWith(mockPool, {
      status: 'draft',
      claim_type: 'food',
      trust_grade: 'B',
      limit: 10,
    });
    await app.close();
  });

  it('returns claims list with cursor metadata', async () => {
    mockListForModeration.mockResolvedValue({
      items: [baseClaim],
      next_cursor: 'cursor-token',
      has_next: true,
    });
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/claims',
      headers: { 'x-admin-token': VALID_TOKEN },
    });
    const body = res.json();
    expect(body.claims).toHaveLength(1);
    expect(body.claims[0].id).toBe(baseClaim.id);
    expect(body.has_next).toBe(true);
    expect(body.next_cursor).toBe('cursor-token');
    await app.close();
  });
});

describe('POST /admin/claims/:id/transition', () => {
  it('rejects published transition for trust_grade=E', async () => {
    mockTransitionStatus.mockResolvedValue({ ok: false, reason: 'grade_E_blocked' });
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'POST',
      url: `/admin/claims/${baseClaim.id}/transition`,
      headers: { 'x-admin-token': VALID_TOKEN, 'content-type': 'application/json' },
      payload: { status: 'published' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.json().error.details[0].issue).toContain('trust_grade E');
    await app.close();
  });

  it('rejects published transition for trust_grade=D without disclaimer_key', async () => {
    mockTransitionStatus.mockResolvedValue({ ok: false, reason: 'grade_D_requires_disclaimer' });
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'POST',
      url: `/admin/claims/${baseClaim.id}/transition`,
      headers: { 'x-admin-token': VALID_TOKEN, 'content-type': 'application/json' },
      payload: { status: 'published' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.json().error.details[0].field).toBe('disclaimer_key');
    await app.close();
  });

  it('publishes successfully for trust_grade=B', async () => {
    const published = { ...baseClaim, status: 'published' as const, published_at: new Date() };
    mockTransitionStatus.mockResolvedValue({ ok: true, claim: published });
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'POST',
      url: `/admin/claims/${baseClaim.id}/transition`,
      headers: { 'x-admin-token': VALID_TOKEN, 'content-type': 'application/json' },
      payload: { status: 'published' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().claim.status).toBe('published');
    expect(mockTransitionStatus).toHaveBeenCalledWith(mockPool, baseClaim.id, {
      toStatus: 'published',
    });
    await app.close();
  });

  it('forwards disclaimer_key when provided', async () => {
    const published = {
      ...baseClaim,
      status: 'published' as const,
      trust_grade: 'D' as const,
      disclaimer_key: 'second_hand_report',
    };
    mockTransitionStatus.mockResolvedValue({ ok: true, claim: published });
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'POST',
      url: `/admin/claims/${baseClaim.id}/transition`,
      headers: { 'x-admin-token': VALID_TOKEN, 'content-type': 'application/json' },
      payload: { status: 'published', disclaimer_key: 'second_hand_report' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockTransitionStatus).toHaveBeenCalledWith(mockPool, baseClaim.id, {
      toStatus: 'published',
      disclaimer_key: 'second_hand_report',
    });
    await app.close();
  });

  it('archives published claim', async () => {
    const archived = { ...baseClaim, status: 'archived' as const };
    mockTransitionStatus.mockResolvedValue({ ok: true, claim: archived });
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'POST',
      url: `/admin/claims/${baseClaim.id}/transition`,
      headers: { 'x-admin-token': VALID_TOKEN, 'content-type': 'application/json' },
      payload: { status: 'archived' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().claim.status).toBe('archived');
    await app.close();
  });

  it('returns 404 when claim is missing', async () => {
    mockTransitionStatus.mockResolvedValue({ ok: false, reason: 'not_found' });
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'POST',
      url: `/admin/claims/${baseClaim.id}/transition`,
      headers: { 'x-admin-token': VALID_TOKEN, 'content-type': 'application/json' },
      payload: { status: 'archived' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 400 for invalid status value', async () => {
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'POST',
      url: `/admin/claims/${baseClaim.id}/transition`,
      headers: { 'x-admin-token': VALID_TOKEN, 'content-type': 'application/json' },
      payload: { status: 'bogus' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(mockTransitionStatus).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PATCH /admin/claims/:id/health-claim', () => {
  it('toggles is_health_claim to true', async () => {
    const updated = { ...baseClaim, is_health_claim: true };
    mockSetHealthClaim.mockResolvedValue(updated);
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/claims/${baseClaim.id}/health-claim`,
      headers: { 'x-admin-token': VALID_TOKEN, 'content-type': 'application/json' },
      payload: { is_health_claim: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().claim.is_health_claim).toBe(true);
    expect(mockSetHealthClaim).toHaveBeenCalledWith(mockPool, baseClaim.id, true);
    await app.close();
  });

  it('returns 404 when claim is missing', async () => {
    mockSetHealthClaim.mockResolvedValue(null);
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/claims/${baseClaim.id}/health-claim`,
      headers: { 'x-admin-token': VALID_TOKEN, 'content-type': 'application/json' },
      payload: { is_health_claim: true },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 400 for invalid body', async () => {
    const app = await makeApp({ withToken: true });
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/claims/${baseClaim.id}/health-claim`,
      headers: { 'x-admin-token': VALID_TOKEN, 'content-type': 'application/json' },
      payload: { is_health_claim: 'yes' },
    });
    expect(res.statusCode).toBe(400);
    expect(mockSetHealthClaim).not.toHaveBeenCalled();
    await app.close();
  });
});
