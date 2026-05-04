import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type pg from 'pg';

const mockListByCelebrity = jest.fn();
const mockListFeed = jest.fn();
const mockFindById = jest.fn();
const mockFindBySlug = jest.fn();

jest.unstable_mockModule('../../src/repositories/lifestyle-claim.repository.js', () => ({
  listByCelebrity: mockListByCelebrity,
  listFeed: mockListFeed,
  findById: mockFindById,
}));

jest.unstable_mockModule('../../src/repositories/celebrity.repository.js', () => ({
  findBySlug: mockFindBySlug,
  list: jest.fn(),
}));

const { lifestyleClaimRoutes } = await import('../../src/routes/lifestyle-claim.routes.js');
const { AppError } = await import('@celebbase/service-core');
const Fastify = (await import('fastify')).default;

const baseClaim = {
  id: '11111111-1111-7111-8111-111111111111',
  celebrity_id: 'celeb-1',
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
  status: 'published' as const,
  published_at: new Date('2026-02-01T00:00:00Z'),
  is_active: true,
  created_at: new Date('2026-01-15T00:00:00Z'),
  updated_at: new Date('2026-02-01T00:00:00Z'),
};

const baseSource = {
  id: '22222222-2222-7222-8222-222222222222',
  claim_id: baseClaim.id,
  source_type: 'interview' as const,
  outlet: 'Vogue',
  url: 'https://vogue.com/article/123',
  published_date: new Date('2026-01-10T00:00:00Z'),
  excerpt: 'I drink matcha every morning.',
  is_primary: true,
  created_at: new Date('2026-01-15T00:00:00Z'),
};

const baseCelebrity = {
  id: 'celeb-1',
  slug: 'ariana-grande',
  display_name: 'Ariana Grande',
  short_bio: null,
  avatar_url: 'https://example.com/avatar.jpg',
  cover_image_url: null,
  category: 'diet' as const,
  tags: ['vegan'],
  is_featured: true,
  sort_order: 1,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockPool = {} as pg.Pool;

async function makeApp(): Promise<ReturnType<typeof Fastify>> {
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
  await app.register(lifestyleClaimRoutes, { pool: mockPool });
  await app.ready();
  return app;
}

beforeEach(() => {
  mockListByCelebrity.mockReset();
  mockListFeed.mockReset();
  mockFindById.mockReset();
  mockFindBySlug.mockReset();
});

describe('GET /celebrities/:slug/claims', () => {
  it('returns claims with has_next and next_cursor', async () => {
    mockFindBySlug.mockResolvedValue(baseCelebrity);
    mockListByCelebrity.mockResolvedValue({
      items: [baseClaim],
      next_cursor: 'cursor-token',
      has_next: true,
    });

    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/celebrities/ariana-grande/claims',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.claims).toHaveLength(1);
    expect(body.claims[0].id).toBe(baseClaim.id);
    expect(body.has_next).toBe(true);
    expect(body.next_cursor).toBe('cursor-token');

    expect(mockFindBySlug).toHaveBeenCalledWith(mockPool, 'ariana-grande');
    expect(mockListByCelebrity).toHaveBeenCalledWith(mockPool, 'celeb-1', {});

    await app.close();
  });

  it('passes claim_type, trust_grade, cursor, limit to repository', async () => {
    mockFindBySlug.mockResolvedValue(baseCelebrity);
    mockListByCelebrity.mockResolvedValue({ items: [], next_cursor: null, has_next: false });

    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/celebrities/ariana-grande/claims?claim_type=food&trust_grade=B&cursor=abc&limit=5',
    });

    expect(res.statusCode).toBe(200);
    expect(mockListByCelebrity).toHaveBeenCalledWith(mockPool, 'celeb-1', {
      claim_type: 'food',
      trust_grade: 'B',
      cursor: 'abc',
      limit: 5,
    });

    await app.close();
  });

  it('returns 404 when celebrity is missing', async () => {
    mockFindBySlug.mockResolvedValue(null);

    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/celebrities/unknown/claims',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    expect(mockListByCelebrity).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 400 when limit exceeds max', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/celebrities/ariana-grande/claims?limit=999',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(mockFindBySlug).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 400 for invalid claim_type', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/celebrities/ariana-grande/claims?claim_type=invalid',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');

    await app.close();
  });
});

describe('GET /claims/feed', () => {
  it('returns mixed feed without filters', async () => {
    mockListFeed.mockResolvedValue({
      items: [baseClaim],
      next_cursor: null,
      has_next: false,
    });

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/claims/feed' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.claims).toHaveLength(1);
    expect(body.has_next).toBe(false);
    expect(body.next_cursor).toBeNull();
    expect(mockListFeed).toHaveBeenCalledWith(mockPool, {});

    await app.close();
  });

  it('forwards claim_type, cursor, limit to repository', async () => {
    mockListFeed.mockResolvedValue({ items: [], next_cursor: null, has_next: false });

    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/claims/feed?claim_type=workout&cursor=xyz&limit=10',
    });

    expect(res.statusCode).toBe(200);
    expect(mockListFeed).toHaveBeenCalledWith(mockPool, {
      claim_type: 'workout',
      cursor: 'xyz',
      limit: 10,
    });

    await app.close();
  });

  it('returns 400 for invalid claim_type', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/claims/feed?claim_type=bogus',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(mockListFeed).not.toHaveBeenCalled();

    await app.close();
  });

  it('rejects unknown query keys (strict)', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/claims/feed?trust_grade=A',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');

    await app.close();
  });
});

describe('GET /claims/:id', () => {
  it('returns claim and sources separately', async () => {
    mockFindById.mockResolvedValue({ ...baseClaim, sources: [baseSource] });

    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: `/claims/${baseClaim.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.claim.id).toBe(baseClaim.id);
    expect(body.claim).not.toHaveProperty('sources');
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0].id).toBe(baseSource.id);
    expect(mockFindById).toHaveBeenCalledWith(mockPool, baseClaim.id);

    await app.close();
  });

  it('returns 404 when claim is missing', async () => {
    mockFindById.mockResolvedValue(null);

    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: `/claims/${baseClaim.id}`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');

    await app.close();
  });

  it('returns 400 for invalid uuid', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/claims/not-a-uuid',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(mockFindById).not.toHaveBeenCalled();

    await app.close();
  });
});
