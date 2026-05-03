// BFF integration tests for /api/celebrities (GET list) and /api/celebrities/[slug] (GET detail).
// Public route → no jose mock needed; forwards to content-service (port 3002).

import { resetRateLimitBucketsForTest } from '../../_lib/bff-fetch';
import { makeRequest, upstreamResponse } from '../../_lib/__tests__/test-helpers';
import { GET as celebritiesListGET } from '../route';
import { GET as celebrityDetailGET } from '../[slug]/route';

const CELEBRITY_LIST_PAYLOAD = {
  items: [],
  next_cursor: null,
  has_next: false,
};

const CELEBRITY_DETAIL_PAYLOAD = {
  id: '018d1a6a-0000-7000-8000-000000000040',
  slug: 'jennie-kim',
  display_name: 'Jennie Kim',
  short_bio: 'K-pop artist',
  avatar_url: 'https://example.com/avatar.jpg',
  cover_image_url: null,
  category: 'general',
  tags: [],
  is_featured: false,
  sort_order: 0,
  is_active: true,
  created_at: '2026-04-23T00:00:00.000Z',
  updated_at: '2026-04-23T00:00:00.000Z',
};

describe('BFF integration — GET /api/celebrities', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('200 — forwards to content-service /celebrities with search', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(CELEBRITY_LIST_PAYLOAD, 200));
    const req = makeRequest({ search: '?limit=20' });
    const res = await celebritiesListGET(req);

    expect(res.status).toBe(200);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3002/celebrities?limit=20');
  });

  it('502 UPSTREAM_UNREACHABLE on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const req = makeRequest();
    const res = await celebritiesListGET(req);

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNREACHABLE');
  });

  it('504 UPSTREAM_TIMEOUT on fetch timeout', async () => {
    fetchSpy.mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const req = makeRequest();
    const res = await celebritiesListGET(req);

    expect(res.status).toBe(504);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('502 BFF_CONTRACT_VIOLATION when upstream body fails schema', async () => {
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse({ wrong_shape: true }, 200),
    );
    const req = makeRequest();
    const res = await celebritiesListGET(req);

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('BFF_CONTRACT_VIOLATION');
  });
});

describe('BFF integration — GET /api/celebrities/[slug]', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('200 — forwards slug with URL encoding', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(CELEBRITY_DETAIL_PAYLOAD, 200));
    const req = makeRequest();
    const res = await celebrityDetailGET(req, { params: Promise.resolve({ slug: 'jennie-kim' }) });

    expect(res.status).toBe(200);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3002/celebrities/jennie-kim');
    const body = await res.json() as { celebrity: { slug: string } };
    expect(body.celebrity.slug).toBe('jennie-kim');
  });

  it('404 upstream → BFF propagates non-ok envelope', async () => {
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse({ error: { code: 'NOT_FOUND', message: 'Celebrity not found' } }, 404),
    );
    const req = makeRequest();
    const res = await celebrityDetailGET(req, { params: Promise.resolve({ slug: 'missing' }) });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('502 UPSTREAM_UNREACHABLE on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const req = makeRequest();
    const res = await celebrityDetailGET(req, { params: Promise.resolve({ slug: 'any' }) });

    expect(res.status).toBe(502);
  });
});
