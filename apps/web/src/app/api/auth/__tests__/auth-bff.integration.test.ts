// BFF integration tests for public auth routes (login + signup).
// Verifies request validation, upstream routing (user-service port 3001),
// error mapping (502 / 504), and rate-limit enforcement (/auth/* → 20/min).

import { resetRateLimitBucketsForTest } from '../../_lib/bff-fetch';
import { makeRequest, upstreamResponse } from '../../_lib/__tests__/test-helpers';
import { POST as loginPOST } from '../login/route';
import { POST as signupPOST } from '../signup/route';

const VALID_LOGIN_BODY = { email: 'alice@example.com' };
const VALID_SIGNUP_BODY = { email: 'bob@example.com', display_name: 'Bob' };
const TOKEN_PAYLOAD = {
  access_token: 'access-abc',
  refresh_token: 'refresh-xyz',
  user: {
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
  },
};

describe('BFF integration — POST /api/auth/login', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('200 on valid body — forwards to user-service /auth/login and sets session cookies', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(TOKEN_PAYLOAD, 200));
    const req = makeRequest({ body: VALID_LOGIN_BODY, forwardedFor: '10.0.0.1' });
    const res = await loginPOST(req);

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3001/auth/login');
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain('cb_access=access-abc');
    expect(setCookies[1]).toContain('cb_refresh=refresh-xyz');
    const body = await res.json() as { user: { email: string } };
    expect(body.user.email).toBe('bob@example.com');
  });

  it('400 VALIDATION_ERROR when email missing', async () => {
    const req = makeRequest({ body: { not_email: 'x' } });
    const res = await loginPOST(req);

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('502 UPSTREAM_UNREACHABLE on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const req = makeRequest({ body: VALID_LOGIN_BODY });
    const res = await loginPOST(req);

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNREACHABLE');
  });

  it('504 UPSTREAM_TIMEOUT on AbortSignal timeout', async () => {
    fetchSpy.mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const req = makeRequest({ body: VALID_LOGIN_BODY });
    const res = await loginPOST(req);

    expect(res.status).toBe(504);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('forwards upstream 401 envelope code — preserves specific reason (INVALID_CREDENTIALS, MALFORMED, etc.) — CHORE-BFF-401-CONTRACT', async () => {
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse({ error: { code: 'INVALID_CREDENTIALS', message: 'Wrong password' } }, 401),
    );
    const req = makeRequest({ body: VALID_LOGIN_BODY });
    const res = await loginPOST(req);

    expect(res.status).toBe(401);
    // Previously this test asserted code='TOKEN_EXPIRED' because fetchBff
    // threw SessionExpiredError on 401 and createPublicRoute collapsed it.
    // CHORE-BFF-401-CONTRACT: 401 now flows through Result.ok=false so the
    // upstream code survives intact (required for IMPL-MOBILE-AUTH-003's
    // 5-code refresh enum forward to mobile clients).
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(body.error.message).toBe('Wrong password');
  });

  it('429 RATE_LIMITED after exceeding 20 /auth/ requests in burst', async () => {
    fetchSpy.mockResolvedValue(upstreamResponse(TOKEN_PAYLOAD, 200));
    // Same forwardedFor → same rate-limit bucket. Burst of 21 overflows the
    // 20/min /auth/ capacity on the 21st call.
    let lastRes: Response | null = null;
    for (let i = 0; i < 21; i += 1) {
      const req = makeRequest({ body: VALID_LOGIN_BODY, forwardedFor: '10.0.0.99' });
      lastRes = await loginPOST(req);
    }
    expect(lastRes).not.toBeNull();
    expect(lastRes!.status).toBe(429);
    const body = await lastRes!.json() as { error: { code: string; retry_after?: number } };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retry_after).toBe(60);
  });
});

describe('BFF integration — POST /api/auth/signup', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('201 on valid body — forwards to user-service /auth/signup and sets session cookies', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(TOKEN_PAYLOAD, 201));
    const req = makeRequest({ body: VALID_SIGNUP_BODY });
    const res = await signupPOST(req);

    expect(res.status).toBe(201);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3001/auth/signup');
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
  });

  it('400 VALIDATION_ERROR when display_name missing', async () => {
    const req = makeRequest({ body: { email: 'x@y.com' } });
    const res = await signupPOST(req);

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
