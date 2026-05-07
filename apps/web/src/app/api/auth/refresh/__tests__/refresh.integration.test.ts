import { POST } from '../route';
import { resetRateLimitBucketsForTest } from '../../../_lib/bff-fetch';

function makeRequest(opts?: {
  refreshToken?: string;
  requestId?: string;
  forwardedFor?: string;
}): Parameters<typeof POST>[0] {
  return {
    headers: {
      get(name: string) {
        const lower = name.toLowerCase();
        if (lower === 'x-request-id') return opts?.requestId ?? null;
        if (lower === 'x-forwarded-for') return opts?.forwardedFor ?? null;
        return null;
      },
    },
    cookies: {
      get(name: string) {
        if (name === 'cb_refresh' && opts?.refreshToken !== undefined) {
          return { value: opts.refreshToken };
        }
        return undefined;
      },
    },
  } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/auth/refresh', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 401 UNAUTHORIZED when cb_refresh cookie is absent', async () => {
    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 + sets new cookies on successful refresh', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const res = await POST(
      makeRequest({ refreshToken: 'old-refresh-token' }),
    );

    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain('cb_access=new-access-token');
    expect(setCookies[0]).toContain('Path=/');
    expect(setCookies[0]).toContain('Max-Age=900');
    expect(setCookies[1]).toContain('cb_refresh=new-refresh-token');
    expect(setCookies[1]).toContain('Path=/api/auth');
    expect(setCookies[1]).toContain('Max-Age=2592000');
  });

  it('forwards upstream 401 envelope code + clears cookies — CHORE-BFF-401-CONTRACT', async () => {
    // Previously the BFF refresh route collapsed every upstream 401 into
    // 'TOKEN_EXPIRED' (via fetchBff's SessionExpiredError throw). Now it
    // forwards the upstream code (e.g., AUTH-003's MALFORMED enum) so
    // mobile clients can branch on the specific reason. Cookies are still
    // cleared and X-Token-Expired is set for the web fetch interceptor.
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'TOKEN_REUSE_DETECTED', message: 'Token reuse detected' } }),
        { status: 401 },
      ),
    );
    const res = await POST(
      makeRequest({ refreshToken: 'reused-token' }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Token-Expired')).toBe('true');
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('TOKEN_REUSE_DETECTED');
    expect(body.error.message).toBe('Token reuse detected');
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain('cb_access=');
    expect(setCookies[0]).toContain('Max-Age=0');
    expect(setCookies[1]).toContain('cb_refresh=');
    expect(setCookies[1]).toContain('Max-Age=0');
  });

  it('returns upstream 500 envelope when upstream responds 5xx', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'INTERNAL', message: 'boom' } }),
        { status: 500 },
      ),
    );
    const res = await POST(
      makeRequest({ refreshToken: 'valid-token' }),
    );

    expect(res.status).toBe(500);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('INTERNAL');
  });

  it('forwards X-Forwarded-For when present', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'a',
          refresh_token: 'b',
        }),
        { status: 200 },
      ),
    );
    await POST(
      makeRequest({
        refreshToken: 'token',
        forwardedFor: '203.0.113.9',
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('X-Forwarded-For')).toBe('203.0.113.9');
  });
});
