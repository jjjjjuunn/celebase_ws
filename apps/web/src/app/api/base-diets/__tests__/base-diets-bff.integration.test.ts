// BFF integration tests for /api/base-diets/[id] (GET detail).
// Public route → no jose mock needed; forwards to content-service (port 3002).
//
// Regression (FIX-BFF-BASE-DIET-SCHEMA-DRIFT-001): content-service returns the
// base-diet row UNWRAPPED. The route previously validated that against the
// wrapped BaseDietDetailResponseSchema → BFF_CONTRACT_VIOLATION (502). It now
// validates against BaseDietWireSchema and wraps as { base_diet }, mirroring
// /api/celebrities/[slug].

import { resetRateLimitBucketsForTest } from '../../_lib/bff-fetch';
import { makeRequest, upstreamResponse } from '../../_lib/__tests__/test-helpers';
import { GET as baseDietDetailGET } from '../[id]/route';

// Shape mirrors content-service's unwrapped base-diet response (BaseDietWire).
const BASE_DIET_PAYLOAD = {
  id: '018d1a6a-0000-7000-8000-000000000050',
  celebrity_id: '018d1a6a-0000-7000-8000-000000000051',
  name: "Ariana's Plant-Based Japanese Diet",
  description: 'A whole-food, plant-based approach.',
  philosophy: 'Vegan since 2013.',
  diet_type: 'vegan',
  avg_daily_kcal: 2000,
  macro_ratio: { protein_pct: 15, carbs_pct: 60, fat_pct: 25 },
  included_foods: ['tofu', 'tempeh', 'edamame'],
  excluded_foods: ['meat', 'dairy'],
  key_supplements: ['B12', 'Vitamin D'],
  source_refs: [{ type: 'interview', outlet: 'The Mirror', date: '2013-11-15' }],
  verified_by: null,
  last_verified_at: '2026-05-20T01:42:43.750Z',
  version: 1,
  is_active: true,
  created_at: '2026-04-23T00:00:00.000Z',
  updated_at: '2026-04-23T00:00:00.000Z',
};

const BASE_DIET_ID = '018d1a6a-0000-7000-8000-000000000050';

describe('BFF integration — GET /api/base-diets/[id]', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('200 — unwrapped upstream is accepted and wrapped as { base_diet }', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(BASE_DIET_PAYLOAD, 200));
    const req = makeRequest();
    const res = await baseDietDetailGET(req, { params: Promise.resolve({ id: BASE_DIET_ID }) });

    // Before the fix this returned 502 BFF_CONTRACT_VIOLATION (unwrapped row vs
    // wrapped schema). It must now be 200 with the row under `base_diet`.
    expect(res.status).toBe(200);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe(`http://localhost:3002/base-diets/${BASE_DIET_ID}`);
    const body = await res.json() as { base_diet: { id: string; diet_type: string } };
    expect(body.base_diet.id).toBe(BASE_DIET_ID);
    expect(body.base_diet.diet_type).toBe('vegan');
  });

  it('404 upstream → BFF propagates non-ok envelope', async () => {
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse({ error: { code: 'NOT_FOUND', message: 'Base diet not found' } }, 404),
    );
    const req = makeRequest();
    const res = await baseDietDetailGET(req, { params: Promise.resolve({ id: BASE_DIET_ID }) });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('502 UPSTREAM_UNREACHABLE on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const req = makeRequest();
    const res = await baseDietDetailGET(req, { params: Promise.resolve({ id: BASE_DIET_ID }) });

    expect(res.status).toBe(502);
  });
});
