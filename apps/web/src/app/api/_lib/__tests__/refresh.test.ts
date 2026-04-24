import { attemptSilentRefresh } from '../refresh';

describe('attemptSilentRefresh', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns ok=true with new tokens on 200', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await attemptSilentRefresh('valid-refresh', 'req-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newAccess).toBe('new-access');
      expect(result.newRefresh).toBe('new-refresh');
      expect(result.accessExpSec).toBe(900);
      expect(result.refreshExpSec).toBe(2_592_000);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { refresh_token: string };
    expect(body.refresh_token).toBe('valid-refresh');
  });

  it('returns no_cookie when refreshToken is empty string', async () => {
    const result = await attemptSilentRefresh('', 'req-2');

    expect(result).toEqual({ ok: false, reason: 'no_cookie' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns upstream_4xx on 401', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'INVALID_REFRESH_TOKEN' } }),
        { status: 401 },
      ),
    );
    const result = await attemptSilentRefresh('expired-refresh', 'req-3');

    expect(result).toEqual({ ok: false, reason: 'upstream_4xx' });
  });

  it('returns upstream_5xx on 500', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'INTERNAL' } }), {
        status: 500,
      }),
    );
    const result = await attemptSilentRefresh('refresh-token', 'req-4');

    expect(result).toEqual({ ok: false, reason: 'upstream_5xx' });
  });

  it('returns timeout when fetch aborts with TimeoutError', async () => {
    const timeoutErr = new Error('timed out');
    timeoutErr.name = 'TimeoutError';
    fetchSpy.mockRejectedValue(timeoutErr);
    const result = await attemptSilentRefresh('refresh-token', 'req-5');

    expect(result).toEqual({ ok: false, reason: 'timeout' });
  });

  it('returns network on generic fetch rejection', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await attemptSilentRefresh('refresh-token', 'req-6');

    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it('returns schema_mismatch when upstream responds 200 with wrong shape', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'only-access' }), {
        status: 200,
      }),
    );
    const result = await attemptSilentRefresh('refresh-token', 'req-7');

    expect(result).toEqual({ ok: false, reason: 'schema_mismatch' });
  });

  it('returns schema_mismatch when upstream responds 200 with invalid JSON', async () => {
    fetchSpy.mockResolvedValue(
      new Response('not-json-at-all', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    const result = await attemptSilentRefresh('refresh-token', 'req-8');

    expect(result).toEqual({ ok: false, reason: 'schema_mismatch' });
  });

  it('forwards X-Request-Id header to upstream', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'a',
          refresh_token: 'b',
        }),
        { status: 200 },
      ),
    );
    await attemptSilentRefresh('token', 'trace-req-9');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('X-Request-Id')).toBe('trace-req-9');
    expect(headers.get('Content-Type')).toBe('application/json');
  });
});
