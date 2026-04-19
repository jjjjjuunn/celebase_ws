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
import { SessionExpiredError } from '../bff-error';

const mockJwtVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;

// Minimal NextRequest-shaped mock — only the fields createProtectedRoute uses
function makeRequest(opts?: { cookie?: string; requestId?: string }): Parameters<ReturnType<typeof createProtectedRoute>>[0] {
  return {
    headers: {
      get(name: string) {
        if (name.toLowerCase() === 'x-request-id') return opts?.requestId ?? null;
        return null;
      },
    },
    cookies: {
      get(name: string) {
        if (name === 'cb_access') return opts?.cookie !== undefined ? { value: opts.cookie } : undefined;
        return undefined;
      },
    },
  } as unknown as Parameters<ReturnType<typeof createProtectedRoute>>[0];
}

const VALID_PAYLOAD = {
  sub: 'user-abc-123',
  email: 'test@example.com',
  cognito_sub: 'cognito-sub-xyz',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
};

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

  it('returns 401 with X-Token-Expired header when token is expired', async () => {
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
    const [, session] = handler.mock.calls[0] as [unknown, { user_id: string; email: string; cognito_sub: string }];
    expect(session.user_id).toBe('user-abc-123');
    expect(session.cognito_sub).toBe('cognito-sub-xyz');
    expect(session.email).toBe('test@example.com');
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

  // D29 / R14: fetchBff inside an API route throws SessionExpiredError on
  // BE 401. The wrapper must return 401 JSON with X-Token-Expired — NOT a
  // 307 redirect. redirect() inside an API route would cascade NEXT_REDIRECT
  // which the client's fetch-based useQuery cannot follow.
  it('returns 401 JSON with X-Token-Expired when handler throws SessionExpiredError', async () => {
    mockJwtVerify.mockResolvedValueOnce(
      { payload: VALID_PAYLOAD, protectedHeader: { alg: 'HS256' } } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    );
    const handler = jest.fn().mockImplementation(() => {
      throw new SessionExpiredError('/users/me');
    });
    const wrapped = createProtectedRoute(handler);
    const res = await wrapped(makeRequest({ cookie: 'valid-token' }));

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Token-Expired')).toBe('true');
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('TOKEN_EXPIRED');
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
