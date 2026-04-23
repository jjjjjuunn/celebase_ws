import { POST } from '../route';
import { resetRateLimitBucketsForTest } from '../../../_lib/bff-fetch';

function makeRequest(opts?: {
  accessToken?: string;
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
        if (name === 'cb_access' && opts?.accessToken !== undefined) {
          return { value: opts.accessToken };
        }
        if (name === 'cb_refresh' && opts?.refreshToken !== undefined) {
          return { value: opts.refreshToken };
        }
        return undefined;
      },
    },
  } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/auth/logout', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 204 and clears cookies on successful upstream 200', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await POST(
      makeRequest({
        accessToken: 'access-token-abc',
        refreshToken: 'refresh-token-xyz',
        requestId: 'req-001',
      }),
    );

    expect(res.status).toBe(204);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain('cb_access=');
    expect(setCookies[0]).toContain('Max-Age=0');
    expect(setCookies[0]).toContain('Path=/');
    expect(setCookies[1]).toContain('cb_refresh=');
    expect(setCookies[1]).toContain('Max-Age=0');
    expect(setCookies[1]).toContain('Path=/api/auth');
  });

  it('skips forward when cb_refresh cookie is missing but still returns 204 + clears cookies', async () => {
    const res = await POST(
      makeRequest({
        accessToken: 'access-token-abc',
        requestId: 'req-002',
      }),
    );

    expect(res.status).toBe(204);
    expect(fetchSpy).not.toHaveBeenCalled();
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
  });

  it('skips forward when cb_access cookie is missing but still returns 204', async () => {
    const res = await POST(
      makeRequest({
        refreshToken: 'refresh-token-xyz',
        requestId: 'req-003',
      }),
    );

    expect(res.status).toBe(204);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 204 even when upstream responds 5xx (best-effort)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'INTERNAL' } }), {
        status: 500,
      }),
    );
    const res = await POST(
      makeRequest({
        accessToken: 'access-token-abc',
        refreshToken: 'refresh-token-xyz',
      }),
    );

    expect(res.status).toBe(204);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 204 even when upstream times out (best-effort)', async () => {
    const timeoutErr = new Error('The operation was aborted');
    timeoutErr.name = 'TimeoutError';
    fetchSpy.mockRejectedValue(timeoutErr);
    const res = await POST(
      makeRequest({
        accessToken: 'access-token-abc',
        refreshToken: 'refresh-token-xyz',
      }),
    );

    expect(res.status).toBe(204);
  });

  it('returns 204 when upstream responds 401 (SessionExpired swallowed)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), {
        status: 401,
      }),
    );
    const res = await POST(
      makeRequest({
        accessToken: 'expired-access-token',
        refreshToken: 'refresh-token-xyz',
      }),
    );

    expect(res.status).toBe(204);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
  });

  it('forwards refresh_token in request body to upstream', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    await POST(
      makeRequest({
        accessToken: 'access-token-abc',
        refreshToken: 'refresh-token-xyz',
        requestId: 'req-body-check',
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('http://localhost:3001/auth/logout');
    expect(init.method).toBe('POST');
    const parsedBody = JSON.parse(init.body as string) as { refresh_token: string };
    expect(parsedBody.refresh_token).toBe('refresh-token-xyz');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer access-token-abc');
    expect(headers.get('X-Request-Id')).toBe('req-body-check');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('propagates X-Forwarded-For to upstream when present', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    await POST(
      makeRequest({
        accessToken: 'access-token-abc',
        refreshToken: 'refresh-token-xyz',
        forwardedFor: '203.0.113.5',
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('X-Forwarded-For')).toBe('203.0.113.5');
  });
});
