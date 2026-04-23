// BFF integration tests for /api/meal-plans (GET list + POST generate).
// Protected route → jose mock required; forwards to meal-plan-service (port 3003).

jest.mock('jose', () => {
  class JWTExpired extends Error {
    public code = 'ERR_JWT_EXPIRED';
    constructor(message = 'JWT expired') {
      super(message);
      this.name = 'JWTExpired';
    }
  }
  class JWSSignatureVerificationFailed extends Error {
    public code = 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED';
    constructor(message = 'signature verification failed') {
      super(message);
      this.name = 'JWSSignatureVerificationFailed';
    }
  }
  return {
    jwtVerify: jest.fn(),
    errors: { JWTExpired, JWSSignatureVerificationFailed },
  };
});

import { jwtVerify } from 'jose';
import { resetRateLimitBucketsForTest } from '../../_lib/bff-fetch';
import {
  makeRequest,
  upstreamResponse,
  VALID_SESSION_PAYLOAD,
} from '../../_lib/__tests__/test-helpers';
import { GET as mealPlansGET, POST as mealPlansPOST } from '../route';

const mockJwtVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;

const MEAL_PLAN_LIST_PAYLOAD = {
  items: [],
  next_cursor: null,
  has_next: false,
};

const GENERATE_REQUEST_BODY = {
  base_diet_id: '018d1a6a-0000-7000-8000-000000000020',
  duration_days: 7,
};

// GenerateMealPlanResponse is a thin accept-envelope — not the full meal_plan row.
const GENERATED_MEAL_PLAN_PAYLOAD = {
  id: '018d1a6a-0000-7000-8000-000000000030',
  status: 'queued',
  estimated_completion_sec: 30,
  poll_url: '/meal-plans/018d1a6a-0000-7000-8000-000000000030',
  ws_channel: 'meal-plan-018d1a6a-0000-7000-8000-000000000030',
};

function validSession(): void {
  mockJwtVerify.mockResolvedValueOnce(
    { payload: VALID_SESSION_PAYLOAD, protectedHeader: { alg: 'HS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
  );
}

describe('BFF integration — GET /api/meal-plans', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('200 — forwards to meal-plan-service /meal-plans with search', async () => {
    validSession();
    fetchSpy.mockResolvedValueOnce(upstreamResponse(MEAL_PLAN_LIST_PAYLOAD, 200));
    const req = makeRequest({ cookie: 'valid-access', search: '?limit=10' });
    const res = await mealPlansGET(req);

    expect(res.status).toBe(200);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3003/meal-plans?limit=10');
  });

  it('401 UNAUTHORIZED when cb_access missing', async () => {
    const req = makeRequest();
    const res = await mealPlansGET(req);

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('502 UPSTREAM_UNREACHABLE on network error', async () => {
    validSession();
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const req = makeRequest({ cookie: 'valid-access' });
    const res = await mealPlansGET(req);

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNREACHABLE');
  });

  it('504 UPSTREAM_TIMEOUT on fetch timeout', async () => {
    validSession();
    fetchSpy.mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const req = makeRequest({ cookie: 'valid-access' });
    const res = await mealPlansGET(req);

    expect(res.status).toBe(504);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_TIMEOUT');
  });
});

describe('BFF integration — POST /api/meal-plans', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('201 — forwards POST to /meal-plans/generate', async () => {
    validSession();
    fetchSpy.mockResolvedValueOnce(upstreamResponse(GENERATED_MEAL_PLAN_PAYLOAD, 201));
    const req = makeRequest({ cookie: 'valid-access', body: GENERATE_REQUEST_BODY });
    const res = await mealPlansPOST(req);

    expect(res.status).toBe(201);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3003/meal-plans/generate');
    const calledInit = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(calledInit.method).toBe('POST');
  });

  it('400 VALIDATION_ERROR when base_diet_id missing (no upstream call)', async () => {
    validSession();
    const req = makeRequest({ cookie: 'valid-access', body: { duration_days: 7 } });
    const res = await mealPlansPOST(req);

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 VALIDATION_ERROR when duration_days exceeds 30', async () => {
    validSession();
    const req = makeRequest({
      cookie: 'valid-access',
      body: { ...GENERATE_REQUEST_BODY, duration_days: 31 },
    });
    const res = await mealPlansPOST(req);

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
