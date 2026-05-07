// IMPL-MOBILE-SUB-SYNC-002 — BFF /api/subscriptions/sync integration tests.
//
// Verifies:
//   - happy path: cookie session → mints internal JWT → commerce 200 → forwards
//   - happy path: bearer (mobile) session → same flow
//   - T4 enforce: body's user_id is IGNORED, session.user_id is sent upstream
//   - 401 when no session
//   - 400 on bad body (invalid source)
//   - 502 forwarded REVENUECAT_UNAVAILABLE upstream
//   - 504 on fetch timeout
//   - upstream schema mismatch → 502 UPSTREAM_SCHEMA_MISMATCH

jest.mock('jose', () => {
  class JWTExpired extends Error {
    public code = 'ERR_JWT_EXPIRED';
    constructor(message = 'JWT expired') { super(message); this.name = 'JWTExpired'; }
  }
  class JWSSignatureVerificationFailed extends Error {
    public code = 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED';
    constructor(message = 'signature verification failed') { super(message); this.name = 'JWSSignatureVerificationFailed'; }
  }
  // SignJWT chainable mock: each setter returns `this`, sign() resolves to a fake token.
  class SignJWT {
    constructor() { /* no-op */ }
    setProtectedHeader(): this { return this; }
    setIssuedAt(): this { return this; }
    setNotBefore(): this { return this; }
    setExpirationTime(): this { return this; }
    setIssuer(): this { return this; }
    setAudience(): this { return this; }
    setJti(): this { return this; }
    async sign(): Promise<string> { return 'fake-internal-jwt'; }
  }
  return {
    jwtVerify: jest.fn(),
    SignJWT,
    errors: { JWTExpired, JWSSignatureVerificationFailed },
  };
});

import { jwtVerify } from 'jose';
import { resetRateLimitBucketsForTest } from '../../../_lib/bff-fetch';
import {
  makeRequest,
  upstreamResponse,
  VALID_SESSION_PAYLOAD,
} from '../../../_lib/__tests__/test-helpers';
import { POST as syncPOST } from '../route';

const mockJwtVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;

function validSession(): void {
  mockJwtVerify.mockResolvedValueOnce(
    { payload: VALID_SESSION_PAYLOAD, protectedHeader: { alg: 'HS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
  );
}

// VALID_SESSION_PAYLOAD.sub ('user-abc-123') is not a UUID, so the upstream
// shape that returns the same id needs an actual UUID for ResponseSchema
// validation. Use a UUID v7-ish stub.
const UPSTREAM_USER_ID = '01900000-0000-7000-8000-000000000001';
const HAPPY_RESPONSE = {
  user_id: UPSTREAM_USER_ID,
  tier: 'premium' as const,
  status: 'active' as const,
  current_period_end: '2026-06-01T00:00:00.000Z',
  source: 'purchase' as const,
};

describe('BFF integration — POST /api/subscriptions/sync', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('200 happy path — cookie session forwards to commerce internal endpoint with session.user_id', async () => {
    validSession();
    fetchSpy.mockResolvedValueOnce(upstreamResponse(HAPPY_RESPONSE, 200));
    const req = makeRequest({ cookie: 'valid-access', body: { source: 'purchase' } });
    const res = await syncPOST(req);

    expect(res.status).toBe(200);
    const body = await res.json() as typeof HAPPY_RESPONSE;
    expect(body.tier).toBe('premium');
    // Response contains the upstream user_id (which is what commerce returned).
    expect(body.user_id).toBe(UPSTREAM_USER_ID);

    // Verify upstream called with internal JWT (Authorization: Bearer fake-internal-jwt)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toContain('/internal/subscriptions/refresh-from-revenuecat');
    const calledHeaders = (calledInit as RequestInit).headers as Record<string, string>;
    expect(calledHeaders['Authorization']).toBe('Bearer fake-internal-jwt');

    // T4 enforce: body sent upstream should have session.user_id, not anything else
    const calledBody = JSON.parse(String((calledInit as RequestInit).body)) as { user_id: string; source: string };
    expect(calledBody.user_id).toBe(VALID_SESSION_PAYLOAD.sub);
    expect(calledBody.source).toBe('purchase');
  });

  it('200 happy path — bearer (mobile) session', async () => {
    validSession();
    fetchSpy.mockResolvedValueOnce(upstreamResponse(HAPPY_RESPONSE, 200));
    const req = makeRequest({
      authorization: 'Bearer mobile-access-jwt',
      body: { source: 'app_open' },
    });
    const res = await syncPOST(req);

    expect(res.status).toBe(200);
    const body = await res.json() as typeof HAPPY_RESPONSE;
    expect(body.tier).toBe('premium');
  });

  it('T4 enforce: client-supplied user_id in body is ignored — session.user_id wins', async () => {
    validSession();
    fetchSpy.mockResolvedValueOnce(upstreamResponse(HAPPY_RESPONSE, 200));
    const req = makeRequest({
      cookie: 'valid-access',
      body: {
        user_id: 'attacker-supplied-user-id', // strict zod schema rejects this
        source: 'purchase',
      },
    });
    const res = await syncPOST(req);

    // strict() rejects unknown keys → 400 VALIDATION_ERROR before reaching upstream
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('401 UNAUTHORIZED when no session (no cookie, no Authorization)', async () => {
    const req = makeRequest({ body: { source: 'purchase' } });
    const res = await syncPOST(req);

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_ERROR on missing source', async () => {
    validSession();
    const req = makeRequest({ cookie: 'valid-access', body: {} });
    const res = await syncPOST(req);

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 VALIDATION_ERROR on invalid source value', async () => {
    validSession();
    const req = makeRequest({ cookie: 'valid-access', body: { source: 'cron' } });
    const res = await syncPOST(req);

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('502 forwards upstream REVENUECAT_UNAVAILABLE envelope', async () => {
    validSession();
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse(
        { error: { code: 'REVENUECAT_UNAVAILABLE', message: 'RevenueCat REST API unavailable' } },
        502,
      ),
    );
    const req = makeRequest({ cookie: 'valid-access', body: { source: 'purchase' } });
    const res = await syncPOST(req);

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('REVENUECAT_UNAVAILABLE');
  });

  it('504 UPSTREAM_TIMEOUT on fetch TimeoutError', async () => {
    validSession();
    fetchSpy.mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const req = makeRequest({ cookie: 'valid-access', body: { source: 'purchase' } });
    const res = await syncPOST(req);

    expect(res.status).toBe(504);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('502 UPSTREAM_UNREACHABLE on network error', async () => {
    validSession();
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const req = makeRequest({ cookie: 'valid-access', body: { source: 'purchase' } });
    const res = await syncPOST(req);

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNREACHABLE');
  });

  it('502 UPSTREAM_SCHEMA_MISMATCH when upstream returns malformed shape', async () => {
    validSession();
    // Missing required fields (tier, status). Schema validation fails.
    fetchSpy.mockResolvedValueOnce(upstreamResponse({ user_id: 'abc' }, 200));
    const req = makeRequest({ cookie: 'valid-access', body: { source: 'purchase' } });
    const res = await syncPOST(req);

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_SCHEMA_MISMATCH');
  });

  it('413 PAYLOAD_TOO_LARGE when upstream response > 1 MB (codex r1 MEDIUM)', async () => {
    validSession();
    // Synthesize content-length > 1 MB header. The actual body is small but
    // the advisory header trips the guard before .text() is called.
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse(HAPPY_RESPONSE, 200, { 'content-length': String(2 * 1024 * 1024) }),
    );
    const req = makeRequest({ cookie: 'valid-access', body: { source: 'purchase' } });
    const res = await syncPOST(req);

    expect(res.status).toBe(413);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('forwards upstream 401 envelope code unchanged (CHORE-BFF-401-CONTRACT)', async () => {
    validSession();
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse({ error: { code: 'UNAUTHORIZED', message: 'Invalid internal token' } }, 401),
    );
    const req = makeRequest({ cookie: 'valid-access', body: { source: 'purchase' } });
    const res = await syncPOST(req);

    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
