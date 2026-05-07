// BFF integration tests for /api/users/me (GET + PATCH).
// Protected route — jose must be mocked so createProtectedRoute's jwtVerify
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
import { GET as meGET, PATCH as mePATCH } from '../me/route';

const mockJwtVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;

const USER_PAYLOAD = {
  id: '018d1a6a-0000-7000-8000-000000000001',
  cognito_sub: 'cognito-bob',
  email: 'bob@example.com',
  display_name: 'Bob',
  avatar_url: null,
  subscription_tier: 'free',
  locale: 'en-US',
  timezone: 'UTC',
  preferred_celebrity_slug: null,
  created_at: '2026-04-23T00:00:00.000Z',
  updated_at: '2026-04-23T00:00:00.000Z',
  deleted_at: null,
};

function validSession(): void {
  mockJwtVerify.mockResolvedValueOnce(
    { payload: VALID_SESSION_PAYLOAD, protectedHeader: { alg: 'HS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
  );
}

describe('BFF integration — GET /api/users/me', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('200 — forwards to user-service /users/me', async () => {
    validSession();
    fetchSpy.mockResolvedValueOnce(upstreamResponse(USER_PAYLOAD, 200));
    const req = makeRequest({ cookie: 'valid-access' });
    const res = await meGET(req);

    expect(res.status).toBe(200);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3001/users/me');
    const body = await res.json() as { user: { email: string } };
    expect(body.user.email).toBe('bob@example.com');
  });

  it('401 UNAUTHORIZED when cb_access missing (no upstream call)', async () => {
    const req = makeRequest();
    const res = await meGET(req);

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('502 UPSTREAM_UNREACHABLE on network error', async () => {
    validSession();
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const req = makeRequest({ cookie: 'valid-access' });
    const res = await meGET(req);

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNREACHABLE');
  });

  it('504 UPSTREAM_TIMEOUT on fetch timeout', async () => {
    validSession();
    fetchSpy.mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const req = makeRequest({ cookie: 'valid-access' });
    const res = await meGET(req);

    expect(res.status).toBe(504);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('forwards upstream 401 envelope code unchanged — CHORE-BFF-401-CONTRACT', async () => {
    // CHORE-BFF-401-CONTRACT: fetchBff no longer throws SessionExpiredError
    // on upstream 401. Envelope code is preserved (e.g., AUTH-003's 5-code
    // refresh enum) so mobile state machine can branch.
    validSession();
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse({ error: { code: 'TOKEN_REUSE_DETECTED', message: 'Token reuse detected' } }, 401),
    );
    const req = makeRequest({ cookie: 'valid-access' });
    const res = await meGET(req);

    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('TOKEN_REUSE_DETECTED');
    expect(body.error.message).toBe('Token reuse detected');
  });
});

describe('BFF integration — PATCH /api/users/me', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('200 — forwards PATCH to user-service /users/me', async () => {
    validSession();
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse({ ...USER_PAYLOAD, display_name: 'Alice' }, 200),
    );
    const req = makeRequest({ cookie: 'valid-access', body: { display_name: 'Alice' } });
    const res = await mePATCH(req);

    expect(res.status).toBe(200);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3001/users/me');
    const calledInit = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(calledInit.method).toBe('PATCH');
  });

  it('400 VALIDATION_ERROR when preferred_celebrity_slug fails regex', async () => {
    validSession();
    const req = makeRequest({
      cookie: 'valid-access',
      body: { preferred_celebrity_slug: 'INVALID SLUG' },
    });
    const res = await mePATCH(req);

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
