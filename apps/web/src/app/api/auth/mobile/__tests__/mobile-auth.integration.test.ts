// IMPL-MOBILE-AUTH-002a — BFF mobile signup/login integration tests.
//
// Mobile contract differs from web in two ways:
//   1. NO Set-Cookie headers on any response (mobile uses expo-secure-store)
//   2. Response body returns { user, access_token, refresh_token } directly
//
// Everything else (validation, upstream forwarding, error mapping, BFF rate-limit)
// inherits the existing /auth/* path behavior — no separate tests for those.

import { resetRateLimitBucketsForTest } from '../../../_lib/bff-fetch';
import { makeRequest, upstreamResponse } from '../../../_lib/__tests__/test-helpers';
import { POST as mobileLoginPOST } from '../login/route';
import { POST as mobileSignupPOST } from '../signup/route';

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

describe('BFF integration — POST /api/auth/mobile/login', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('200 on valid body — forwards to user-service /auth/login, returns JSON tokens, NO cookies', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(TOKEN_PAYLOAD, 200));
    const req = makeRequest({ body: VALID_LOGIN_BODY, forwardedFor: '10.0.0.1' });
    const res = await mobileLoginPOST(req);

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3001/auth/login');

    // Mobile contract: zero Set-Cookie headers
    expect(res.headers.getSetCookie()).toHaveLength(0);

    // Mobile contract: tokens in body
    const body = (await res.json()) as {
      user: { email: string };
      access_token: string;
      refresh_token: string;
    };
    expect(body.user.email).toBe('bob@example.com');
    expect(body.access_token).toBe('access-abc');
    expect(body.refresh_token).toBe('refresh-xyz');
  });

  it('400 VALIDATION_ERROR when email missing — no upstream call', async () => {
    const req = makeRequest({ body: { not_email: 'x' } });
    const res = await mobileLoginPOST(req);

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it('upstream 401 forwarded — envelope code preserved (e.g., MALFORMED enum survives)', async () => {
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse({ error: { code: 'MALFORMED', message: 'Malformed or invalid refresh token' } }, 401),
    );
    const req = makeRequest({ body: VALID_LOGIN_BODY });
    const res = await mobileLoginPOST(req);

    expect(res.status).toBe(401);
    // No cookies on error path either
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it('502 UPSTREAM_UNREACHABLE on network error — no cookies', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const req = makeRequest({ body: VALID_LOGIN_BODY });
    const res = await mobileLoginPOST(req);

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNREACHABLE');
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});

describe('BFF integration — POST /api/auth/mobile/signup', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('201 on valid body — forwards to user-service /auth/signup, returns JSON tokens, NO cookies', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(TOKEN_PAYLOAD, 201));
    const req = makeRequest({ body: VALID_SIGNUP_BODY });
    const res = await mobileSignupPOST(req);

    expect(res.status).toBe(201);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3001/auth/signup');

    // Mobile contract: zero Set-Cookie headers
    expect(res.headers.getSetCookie()).toHaveLength(0);

    // Mobile contract: tokens in body (NOT just { user })
    const body = (await res.json()) as {
      user: { email: string };
      access_token: string;
      refresh_token: string;
    };
    expect(body.user.email).toBe('bob@example.com');
    expect(body.access_token).toBe('access-abc');
    expect(body.refresh_token).toBe('refresh-xyz');
  });

  it('400 VALIDATION_ERROR when display_name missing — no upstream call', async () => {
    const req = makeRequest({ body: { email: 'x@y.com' } });
    const res = await mobileSignupPOST(req);

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});
