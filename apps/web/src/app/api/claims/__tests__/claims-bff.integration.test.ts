// BFF integration tests for /api/celebrities/[slug]/claims, /api/claims/feed, /api/claims/[id].
// Public routes → no jose mock needed; forwards to content-service (port 3002).
// CJS jest mode (jest.config.cjs useESM:false) → @types/jest auto-injects globals; no @jest/globals import.

import { resetRateLimitBucketsForTest } from '../../_lib/bff-fetch';
import { makeRequest, upstreamResponse } from '../../_lib/__tests__/test-helpers';
import { GET as celebrityClaimsGET } from '../../celebrities/[slug]/claims/route';
import { GET as claimsFeedGET } from '../feed/route';
import { GET as claimDetailGET } from '../[id]/route';

const CLAIM_LIST_PAYLOAD = {
  claims: [],
  next_cursor: null,
  has_next: false,
};

const CLAIM_DETAIL_PAYLOAD = {
  claim: {
    id: '01927000-0000-7000-8000-000000000001',
    celebrity_id: '018d1a6a-0000-7000-8000-000000000040',
    claim_type: 'food',
    headline: 'Starts every morning with celery juice',
    body: null,
    trust_grade: 'B',
    primary_source_url: 'https://www.vogue.com/article/celery-juice-routine',
    verified_by: null,
    last_verified_at: '2026-04-01T00:00:00.000Z',
    is_health_claim: false,
    disclaimer_key: null,
    base_diet_id: null,
    tags: ['morning-routine'],
    status: 'published',
    published_at: '2026-04-15T00:00:00.000Z',
    is_active: true,
    created_at: '2026-04-15T00:00:00.000Z',
    updated_at: '2026-04-15T00:00:00.000Z',
  },
  sources: [
    {
      id: '01927000-0000-7000-8000-000000000101',
      claim_id: '01927000-0000-7000-8000-000000000001',
      source_type: 'article',
      outlet: 'Vogue',
      url: 'https://www.vogue.com/article/celery-juice-routine',
      published_date: '2026-04-01',
      excerpt: 'I drink celery juice every morning before anything else.',
      is_primary: true,
      created_at: '2026-04-15T00:00:00.000Z',
    },
  ],
};

describe('BFF integration — GET /api/celebrities/[slug]/claims', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('200 — forwards slug + search to content-service', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(CLAIM_LIST_PAYLOAD, 200));
    const req = makeRequest({ search: '?claim_type=food&limit=20' });
    const res = await celebrityClaimsGET(req, { params: Promise.resolve({ slug: 'jennie-kim' }) });

    expect(res.status).toBe(200);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3002/celebrities/jennie-kim/claims?claim_type=food&limit=20');
  });

  it('502 UPSTREAM_UNREACHABLE on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const req = makeRequest();
    const res = await celebrityClaimsGET(req, { params: Promise.resolve({ slug: 'jennie-kim' }) });

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNREACHABLE');
  });

  it('504 UPSTREAM_TIMEOUT on fetch timeout', async () => {
    fetchSpy.mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const req = makeRequest();
    const res = await celebrityClaimsGET(req, { params: Promise.resolve({ slug: 'jennie-kim' }) });

    expect(res.status).toBe(504);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('502 BFF_CONTRACT_VIOLATION when upstream body fails schema', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse({ wrong_shape: true }, 200));
    const req = makeRequest();
    const res = await celebrityClaimsGET(req, { params: Promise.resolve({ slug: 'jennie-kim' }) });

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('BFF_CONTRACT_VIOLATION');
  });

  it('mock branch — returns inline payload when NEXT_PUBLIC_USE_MOCK_CLAIMS=true', async () => {
    const original = process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'];
    process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'] = 'true';
    try {
      const req = makeRequest();
      const res = await celebrityClaimsGET(req, { params: Promise.resolve({ slug: 'jennie-kim' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('X-BFF-Mock')).toBe('claims');
      expect(fetchSpy).not.toHaveBeenCalled();
      const body = await res.json() as { claims: unknown[]; has_next: boolean };
      expect(Array.isArray(body.claims)).toBe(true);
      expect(body.has_next).toBe(false);
    } finally {
      if (original === undefined) delete process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'];
      else process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'] = original;
    }
  });
});

describe('BFF integration — GET /api/claims/feed', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('200 — forwards to content-service /claims/feed with search', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(CLAIM_LIST_PAYLOAD, 200));
    const req = makeRequest({ search: '?claim_type=workout&limit=10' });
    const res = await claimsFeedGET(req);

    expect(res.status).toBe(200);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3002/claims/feed?claim_type=workout&limit=10');
  });

  it('502 UPSTREAM_UNREACHABLE on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const req = makeRequest();
    const res = await claimsFeedGET(req);

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNREACHABLE');
  });

  it('504 UPSTREAM_TIMEOUT on fetch timeout', async () => {
    fetchSpy.mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const req = makeRequest();
    const res = await claimsFeedGET(req);

    expect(res.status).toBe(504);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('502 BFF_CONTRACT_VIOLATION when upstream body fails schema', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse({ wrong_shape: true }, 200));
    const req = makeRequest();
    const res = await claimsFeedGET(req);

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('BFF_CONTRACT_VIOLATION');
  });

  it('mock branch — returns inline payload when NEXT_PUBLIC_USE_MOCK_CLAIMS=true', async () => {
    const original = process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'];
    process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'] = 'true';
    try {
      const req = makeRequest();
      const res = await claimsFeedGET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('X-BFF-Mock')).toBe('claims');
      expect(fetchSpy).not.toHaveBeenCalled();
      const body = await res.json() as { claims: unknown[]; has_next: boolean };
      expect(Array.isArray(body.claims)).toBe(true);
      expect(body.has_next).toBe(false);
    } finally {
      if (original === undefined) delete process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'];
      else process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'] = original;
    }
  });
});

describe('BFF integration — GET /api/claims/[id]', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('200 — forwards id to content-service /claims/:id with envelope', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(CLAIM_DETAIL_PAYLOAD, 200));
    const req = makeRequest();
    const res = await claimDetailGET(req, {
      params: Promise.resolve({ id: '01927000-0000-7000-8000-000000000001' }),
    });

    expect(res.status).toBe(200);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe(
      'http://localhost:3002/claims/01927000-0000-7000-8000-000000000001',
    );
    const body = await res.json() as { claim: { id: string }; sources: unknown[] };
    expect(body.claim.id).toBe('01927000-0000-7000-8000-000000000001');
    expect(Array.isArray(body.sources)).toBe(true);
  });

  it('404 upstream → BFF propagates non-ok envelope', async () => {
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse({ error: { code: 'NOT_FOUND', message: 'Claim not found' } }, 404),
    );
    const req = makeRequest();
    const res = await claimDetailGET(req, { params: Promise.resolve({ id: 'missing' }) });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('502 UPSTREAM_UNREACHABLE on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const req = makeRequest();
    const res = await claimDetailGET(req, { params: Promise.resolve({ id: 'any' }) });

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNREACHABLE');
  });

  it('502 BFF_CONTRACT_VIOLATION when upstream body fails schema', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse({ wrong_shape: true }, 200));
    const req = makeRequest();
    const res = await claimDetailGET(req, { params: Promise.resolve({ id: 'any' }) });

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('BFF_CONTRACT_VIOLATION');
  });

  it('mock branch — returns inline detail when NEXT_PUBLIC_USE_MOCK_CLAIMS=true', async () => {
    const original = process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'];
    process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'] = 'true';
    try {
      const req = makeRequest();
      const res = await claimDetailGET(req, { params: Promise.resolve({ id: 'any' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('X-BFF-Mock')).toBe('claims');
      expect(fetchSpy).not.toHaveBeenCalled();
      const body = await res.json() as { claim: { id: string }; sources: unknown[] };
      expect(typeof body.claim.id).toBe('string');
      expect(Array.isArray(body.sources)).toBe(true);
    } finally {
      if (original === undefined) delete process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'];
      else process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'] = original;
    }
  });
});
