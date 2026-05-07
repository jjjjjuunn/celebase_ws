// Must be at the top — jest hoists this before imports in CJS mode
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

import { jwtVerify, errors as joseErrors } from 'jose';
import { createProtectedRoute, createPublicRoute } from '../session';
import { makeRequest, VALID_SESSION_PAYLOAD as VALID_PAYLOAD } from './test-helpers';

const mockJwtVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;

afterEach(() => {
  jest.clearAllMocks();
});

describe('createProtectedRoute', () => {
  it('returns 401 when cb_access cookie is absent', async () => {
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when cb_access cookie is empty string', async () => {
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ cookie: '' }));

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 with X-Token-Expired header when access token is expired and no refresh cookie present', async () => {
    // The mock's JWTExpired has a default message; TS uses the real type which requires 2+ args
    mockJwtVerify.mockRejectedValueOnce(
      new (joseErrors.JWTExpired as unknown as new () => Error)(),
    );
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ cookie: 'expired-token' }));

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Token-Expired')).toBe('true');
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('TOKEN_EXPIRED');
    expect(handler).not.toHaveBeenCalled();
    // No refresh cookie → no clear-cookies emitted (client state is already
    // "logged out" from the cookie's perspective).
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it('returns 401 without X-Token-Expired header for forged/malformed token', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('Invalid signature'));
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ cookie: 'forged-token' }));

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Token-Expired')).toBeNull();
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('injects session.user_id from valid token sub claim', async () => {
    mockJwtVerify.mockResolvedValueOnce(
      { payload: VALID_PAYLOAD, protectedHeader: { alg: 'RS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    );
    const handler = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const wrapped = createProtectedRoute(handler);
    await wrapped(makeRequest({ cookie: 'valid-token' }));

    expect(handler).toHaveBeenCalledTimes(1);
    const [, session] = handler.mock.calls[0] as [unknown, { user_id: string; email: string; cognito_sub: string; authSource: string }];
    expect(session.user_id).toBe('user-abc-123');
    expect(session.cognito_sub).toBe('cognito-sub-xyz');
    expect(session.email).toBe('test@example.com');
    expect(session.authSource).toBe('cookie');
  });

  it('propagates x-request-id from incoming request to response', async () => {
    mockJwtVerify.mockResolvedValueOnce(
      { payload: VALID_PAYLOAD, protectedHeader: { alg: 'RS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    );
    const handler = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ cookie: 'valid-token', requestId: 'trace-xyz' }));

    expect(res.headers.get('X-Request-Id')).toBe('trace-xyz');
  });

  it('generates x-request-id when not present in request', async () => {
    mockJwtVerify.mockResolvedValueOnce(
      { payload: VALID_PAYLOAD, protectedHeader: { alg: 'RS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    );
    const handler = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ cookie: 'valid-token' }));

    const requestId = res.headers.get('X-Request-Id');
    expect(requestId).toBeTruthy();
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns 500 when handler throws', async () => {
    mockJwtVerify.mockResolvedValueOnce(
      { payload: VALID_PAYLOAD, protectedHeader: { alg: 'RS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    );
    const handler = jest.fn().mockRejectedValue(new Error('handler crash'));
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ cookie: 'valid-token' }));

    expect(res.status).toBe(500);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  // CHORE-BFF-401-CONTRACT: handler returning a 401 Response (e.g., from
  // Result.ok=false on upstream 401) is forwarded verbatim. The wrapper no
  // longer rewrites the envelope code into 'TOKEN_EXPIRED' — required for
  // mobile state machine to branch on AUTH-003's 5-code refresh enum.
  it('forwards 401 envelope from handler unchanged (no TOKEN_EXPIRED collapse)', async () => {
    mockJwtVerify.mockResolvedValueOnce(
      { payload: VALID_PAYLOAD, protectedHeader: { alg: 'HS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    );
    const handler = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'MALFORMED', message: 'Malformed token' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ cookie: 'valid-token' }));

    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('MALFORMED');
    expect(body.error.message).toBe('Malformed token');
  });
});

describe('createProtectedRoute silent refresh', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('retries handler with new session on successful silent refresh and appends both Set-Cookie headers', async () => {
    // 1) Expired access token → JWTExpired
    // 2) Silent refresh upstream returns 200 with new tokens
    // 3) Refreshed access token verifies successfully → handler invoked
    mockJwtVerify
      .mockRejectedValueOnce(
        new (joseErrors.JWTExpired as unknown as new () => Error)(),
      )
      .mockResolvedValueOnce(
        { payload: VALID_PAYLOAD, protectedHeader: { alg: 'HS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
      );
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'fresh-access',
          refresh_token: 'fresh-refresh',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const handler = jest.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(
      makeRequest({ cookie: 'expired-access', refreshCookie: 'valid-refresh' }),
    );

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    // Refreshed session is still cookie-sourced — silent refresh never
    // upgrades a cookie path to bearer.
    const [, refreshedSession] = handler.mock.calls[0] as [unknown, { authSource: string }];
    expect(refreshedSession.authSource).toBe('cookie');
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain('cb_access=fresh-access');
    expect(setCookies[0]).toContain('Path=/');
    expect(setCookies[0]).toContain('Max-Age=900');
    expect(setCookies[1]).toContain('cb_refresh=fresh-refresh');
    expect(setCookies[1]).toContain('Path=/api/auth');
    expect(setCookies[1]).toContain('Max-Age=2592000');
  });

  it('returns 401 + clears cookies when upstream refresh 5xx', async () => {
    mockJwtVerify.mockRejectedValueOnce(
      new (joseErrors.JWTExpired as unknown as new () => Error)(),
    );
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'INTERNAL' } }), { status: 500 }),
    );
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(
      makeRequest({ cookie: 'expired-access', refreshCookie: 'valid-refresh' }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Token-Expired')).toBe('true');
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain('cb_access=');
    expect(setCookies[0]).toContain('Path=/');
    expect(setCookies[0]).toContain('Max-Age=0');
    expect(setCookies[1]).toContain('cb_refresh=');
    expect(setCookies[1]).toContain('Path=/api/auth');
    expect(setCookies[1]).toContain('Max-Age=0');
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 + clears cookies when upstream refresh returns 401', async () => {
    mockJwtVerify.mockRejectedValueOnce(
      new (joseErrors.JWTExpired as unknown as new () => Error)(),
    );
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'INVALID_REFRESH_TOKEN' } }),
        { status: 401 },
      ),
    );
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(
      makeRequest({ cookie: 'expired-access', refreshCookie: 'revoked-refresh' }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Token-Expired')).toBe('true');
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain('Max-Age=0');
    expect(setCookies[1]).toContain('Max-Age=0');
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 without firing upstream refresh when cb_refresh absent', async () => {
    mockJwtVerify.mockRejectedValueOnce(
      new (joseErrors.JWTExpired as unknown as new () => Error)(),
    );
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ cookie: 'expired-access' }));

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Token-Expired')).toBe('true');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  // CHORE-BFF-401-CONTRACT: previously, a SessionExpiredError thrown by the
  // handler after a successful refresh triggered cookie clearing in the
  // wrapper. With fetchBff no longer throwing on 401, the handler returns a
  // 401 Response directly and the wrapper forwards it. Stale-cookie cleanup
  // happens on the next request's access-token verify (which fails →
  // silent refresh attempt → if that also fails, cookie clear at line
  // 196-208 of session.ts). Infinite-loop guard is preserved by the verify
  // path itself: there's only ever one silent refresh per request.
  it('forwards handler 401 envelope after silent refresh (next request handles cookie cleanup)', async () => {
    mockJwtVerify
      .mockRejectedValueOnce(
        new (joseErrors.JWTExpired as unknown as new () => Error)(),
      )
      .mockResolvedValueOnce(
        { payload: VALID_PAYLOAD, protectedHeader: { alg: 'HS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
      );
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'fresh-access',
          refresh_token: 'fresh-refresh',
        }),
        { status: 200 },
      ),
    );
    // Handler simulates upstream 401 → returns the envelope as a 401 Response.
    const handler = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'TOKEN_REUSE_DETECTED' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(
      makeRequest({ cookie: 'expired-access', refreshCookie: 'valid-refresh' }),
    );

    expect(res.status).toBe(401);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Envelope code preserved (mobile state machine source of truth).
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('TOKEN_REUSE_DETECTED');
    // Refreshed Set-Cookie still appended (the refresh succeeded). Stale
    // cookies are cleaned up by the next request's verify path, not here.
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.includes('cb_access=fresh-access'))).toBe(true);
  });

  it('pads response to at least 100ms even on no-cookie fast path', async () => {
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const start = performance.now();
    const res = await wrapped(makeRequest());
    const elapsed = performance.now() - start;

    expect(res.status).toBe(401);
    expect(elapsed).toBeGreaterThanOrEqual(95);
  });
});

describe('dual-key rotation overlap', () => {
  const ORIGINAL_NEXT = process.env['INTERNAL_JWT_SECRET_NEXT'];

  afterEach(() => {
    if (ORIGINAL_NEXT === undefined) delete process.env['INTERNAL_JWT_SECRET_NEXT'];
    else process.env['INTERNAL_JWT_SECRET_NEXT'] = ORIGINAL_NEXT;
  });

  it('falls back to CURRENT secret when NEXT fails signature verification', async () => {
    process.env['INTERNAL_JWT_SECRET_NEXT'] = 'next-secret';
    mockJwtVerify
      .mockRejectedValueOnce(new (joseErrors.JWSSignatureVerificationFailed as unknown as new () => Error)())
      .mockResolvedValueOnce(
        { payload: VALID_PAYLOAD, protectedHeader: { alg: 'HS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
      );
    const handler = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ cookie: 'old-signed-token' }));

    expect(res.status).toBe(200);
    expect(mockJwtVerify).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not retry with CURRENT when NEXT throws JWTExpired', async () => {
    process.env['INTERNAL_JWT_SECRET_NEXT'] = 'next-secret';
    mockJwtVerify.mockRejectedValueOnce(
      new (joseErrors.JWTExpired as unknown as new () => Error)(),
    );
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ cookie: 'expired-token' }));

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Token-Expired')).toBe('true');
    expect(mockJwtVerify).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });
});

// IMPL-MOBILE-BFF-001: hybrid BFF auth — Authorization: Bearer path for the
// mobile (Expo / RN) client. Cookie path A is enforced — bearer is only
// evaluated when cb_access is absent. No silent refresh, no Set-Cookie.
describe('createProtectedRoute bearer path', () => {
  it('returns 401 with X-Token-Expired when bearer token is JWTExpired', async () => {
    mockJwtVerify.mockRejectedValueOnce(
      new (joseErrors.JWTExpired as unknown as new () => Error)(),
    );
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(
      makeRequest({ authorization: 'Bearer expired-token' }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Token-Expired')).toBe('true');
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('TOKEN_EXPIRED');
    expect(handler).not.toHaveBeenCalled();
    // Bearer path must never touch the cookie jar.
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it('returns 401 UNAUTHORIZED when bearer token is forged', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('Invalid signature'));
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(
      makeRequest({ authorization: 'Bearer forged-token' }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Token-Expired')).toBeNull();
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(handler).not.toHaveBeenCalled();
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("injects session.authSource='bearer' from valid bearer token", async () => {
    mockJwtVerify.mockResolvedValueOnce(
      { payload: VALID_PAYLOAD, protectedHeader: { alg: 'HS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    );
    const handler = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const wrapped = createProtectedRoute(handler);
    await wrapped(makeRequest({ authorization: 'Bearer valid-token' }));

    expect(handler).toHaveBeenCalledTimes(1);
    const [, session] = handler.mock.calls[0] as [unknown, { user_id: string; authSource: string }];
    expect(session.user_id).toBe('user-abc-123');
    expect(session.authSource).toBe('bearer');
  });

  it('does not emit Set-Cookie on bearer success', async () => {
    mockJwtVerify.mockResolvedValueOnce(
      { payload: VALID_PAYLOAD, protectedHeader: { alg: 'HS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    );
    const handler = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ authorization: 'Bearer valid-token' }));

    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it('does not emit Set-Cookie on bearer 401 envelope (no clearSessionCookies leak to web jar)', async () => {
    // CHORE-BFF-401-CONTRACT: handler returns 401 Response (e.g., from
    // upstream Result.ok=false). Bearer path must NEVER emit Set-Cookie —
    // mobile holds refresh in expo-secure-store, and a stray Set-Cookie
    // would leak into a co-resident browser sharing the network stack.
    mockJwtVerify.mockResolvedValueOnce(
      { payload: VALID_PAYLOAD, protectedHeader: { alg: 'HS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    );
    const handler = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'MALFORMED' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ authorization: 'Bearer valid-token' }));

    expect(res.status).toBe(401);
    // Envelope code preserved on bearer path too (CHORE-BFF-401-CONTRACT).
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('MALFORMED');
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("rejects 'bearer ' (lowercase scheme) per RFC 6750 — falls through to 401 missing-cookie", async () => {
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ authorization: 'bearer some-token' }));

    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Missing session cookie');
    expect(handler).not.toHaveBeenCalled();
    // jwtVerify must not be invoked when the scheme didn't match — otherwise
    // the bearer fallback would be partially active.
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });
});

// Path-confusion regression — D1 enforce. The cookie path is evaluated
// alone whenever cb_access is present; a stolen-cookie-induced 401 must
// never let a different user's bearer token take over.
describe('createProtectedRoute cookie+bearer path confusion (D1)', () => {
  it('cookie forged + bearer valid → cookie path UNAUTHORIZED, bearer ignored', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('Invalid signature'));
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(
      makeRequest({
        cookie: 'forged-cookie',
        authorization: 'Bearer valid-bearer',
      }),
    );

    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(handler).not.toHaveBeenCalled();
    // Only the cookie was verified — bearer was never even examined.
    expect(mockJwtVerify).toHaveBeenCalledTimes(1);
  });

  it('cookie expired + no refresh + bearer valid → 401 TOKEN_EXPIRED, bearer ignored', async () => {
    mockJwtVerify.mockRejectedValueOnce(
      new (joseErrors.JWTExpired as unknown as new () => Error)(),
    );
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(
      makeRequest({
        cookie: 'expired-cookie',
        authorization: 'Bearer valid-bearer',
      }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Token-Expired')).toBe('true');
    expect(handler).not.toHaveBeenCalled();
    expect(mockJwtVerify).toHaveBeenCalledTimes(1);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it('cookie expired + refresh fail + bearer valid → 401 + clearSessionCookies, bearer ignored', async () => {
    mockJwtVerify.mockRejectedValueOnce(
      new (joseErrors.JWTExpired as unknown as new () => Error)(),
    );
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'INVALID_REFRESH_TOKEN' } }), {
        status: 401,
      }),
    );
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(
      makeRequest({
        cookie: 'expired-cookie',
        refreshCookie: 'revoked-refresh',
        authorization: 'Bearer valid-bearer',
      }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Token-Expired')).toBe('true');
    expect(handler).not.toHaveBeenCalled();
    // Cookie path emits clear-cookie even though bearer is ignored.
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain('Max-Age=0');
    expect(setCookies[1]).toContain('Max-Age=0');
    // Bearer was never verified — only the cookie was attempted.
    expect(mockJwtVerify).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });
});

// Timing regression — every new branch must run padToMinLatency so the outer
// response timing can't distinguish bearer-success / bearer-expired /
// bearer-forged / cookie+bearer (path A) flows.
describe('createProtectedRoute bearer timing regression', () => {
  it('pads bearer expired branch to ≥100ms', async () => {
    mockJwtVerify.mockRejectedValueOnce(
      new (joseErrors.JWTExpired as unknown as new () => Error)(),
    );
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const start = performance.now();
    const res = await wrapped(
      makeRequest({ authorization: 'Bearer expired-token' }),
    );
    const elapsed = performance.now() - start;

    expect(res.status).toBe(401);
    expect(elapsed).toBeGreaterThanOrEqual(95);
  });

  it('pads bearer forged branch to ≥100ms', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('Invalid signature'));
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const start = performance.now();
    const res = await wrapped(
      makeRequest({ authorization: 'Bearer forged-token' }),
    );
    const elapsed = performance.now() - start;

    expect(res.status).toBe(401);
    expect(elapsed).toBeGreaterThanOrEqual(95);
  });

  it('pads bearer success branch to ≥100ms (after handler completes)', async () => {
    mockJwtVerify.mockResolvedValueOnce(
      { payload: VALID_PAYLOAD, protectedHeader: { alg: 'HS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    );
    // Fast handler — pad must still bring total to ≥100ms.
    const handler = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const wrapped = createProtectedRoute(handler);
    const start = performance.now();
    const res = await wrapped(makeRequest({ authorization: 'Bearer valid-token' }));
    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(95);
  });

  it('pads cookie+bearer (path A) branch to ≥100ms', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('Invalid signature'));
    const handler = jest.fn();
    const wrapped = createProtectedRoute(handler);
    const start = performance.now();
    const res = await wrapped(
      makeRequest({
        cookie: 'forged-cookie',
        authorization: 'Bearer valid-bearer',
      }),
    );
    const elapsed = performance.now() - start;

    expect(res.status).toBe(401);
    expect(elapsed).toBeGreaterThanOrEqual(95);
  });
});

describe('createPublicRoute', () => {
  it('invokes handler without cookie check', async () => {
    const handler = jest.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const wrapped = createPublicRoute(handler);
    const res = await wrapped(makeRequest());

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when handler throws', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('public handler crash'));
    const wrapped = createPublicRoute(handler);
    const res = await wrapped(makeRequest());

    expect(res.status).toBe(500);
  });
});
