// BFF integration tests for /api/subscriptions/me (GET).
// Protected route → jose mock needed so createProtectedRoute's jwtVerify
// resolves to a valid session.

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
import { GET as subscriptionsMeGET } from '../me/route';

const mockJwtVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;

// Free-tier user — no active paid subscription. The schema allows
// `subscription: null` which is the simplest valid payload.
const SUBSCRIPTION_PAYLOAD = { subscription: null };

function validSession(): void {
  mockJwtVerify.mockResolvedValueOnce(
    { payload: VALID_SESSION_PAYLOAD, protectedHeader: { alg: 'HS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
  );
}

describe('BFF integration — GET /api/subscriptions/me', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('200 — forwards to user-service /subscriptions/me', async () => {
    validSession();
    fetchSpy.mockResolvedValueOnce(upstreamResponse(SUBSCRIPTION_PAYLOAD, 200));
    const req = makeRequest({ cookie: 'valid-access' });
    const res = await subscriptionsMeGET(req);

    expect(res.status).toBe(200);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3001/subscriptions/me');
  });

  it('401 UNAUTHORIZED when cb_access missing (no upstream call)', async () => {
    const req = makeRequest();
    const res = await subscriptionsMeGET(req);

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('502 UPSTREAM_UNREACHABLE on network error', async () => {
    validSession();
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const req = makeRequest({ cookie: 'valid-access' });
    const res = await subscriptionsMeGET(req);

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNREACHABLE');
  });

  it('504 UPSTREAM_TIMEOUT on fetch timeout', async () => {
    validSession();
    fetchSpy.mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const req = makeRequest({ cookie: 'valid-access' });
    const res = await subscriptionsMeGET(req);

    expect(res.status).toBe(504);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('forwards upstream 401 envelope code unchanged — CHORE-BFF-401-CONTRACT', async () => {
    // Previously fetchBff threw SessionExpiredError on 401, collapsing every
    // upstream 401 into 'TOKEN_EXPIRED'. Now the upstream code is preserved
    // (mobile state machine relies on AUTH-003's 5-code refresh enum).
    // X-Token-Expired header is no longer auto-added on the handler-side
    // 401 path — web fetcher (apps/web/src/lib/fetcher.ts:89) redirects on
    // status=401 regardless of the header, so this is not a web regression.
    validSession();
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse({ error: { code: 'INVALID_TOKEN', message: 'Token revoked' } }, 401),
    );
    const req = makeRequest({ cookie: 'valid-access' });
    const res = await subscriptionsMeGET(req);

    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INVALID_TOKEN');
    expect(body.error.message).toBe('Token revoked');
  });
});
