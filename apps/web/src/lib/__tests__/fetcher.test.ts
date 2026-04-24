import { z } from 'zod';
import { FetcherError, fetcher, postJson } from '../fetcher';

const mockFetch = jest.spyOn(globalThis, 'fetch');

function makeResponse(body: unknown, opts: { status?: number; headers?: Record<string, string> } = {}): Response {
  const status = opts.status ?? 200;
  const bodyStr = body === undefined ? '' : JSON.stringify(body);
  return new Response(bodyStr === '' ? null : bodyStr, {
    status,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
}

afterEach(() => {
  mockFetch.mockReset();
});

describe('fetcher', () => {
  it('throws when path does not start with /api/', async () => {
    await expect(fetcher('/users/me')).rejects.toThrow("path must start with '/api/'");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sets credentials: same-origin on every request', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: true }));
    await fetcher('/api/users/me');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/users/me',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('returns parsed payload when status is 2xx and no schema', async () => {
    const payload = { data: 'hello' };
    mockFetch.mockResolvedValueOnce(makeResponse(payload));
    const result = await fetcher('/api/test');
    expect(result).toEqual(payload);
  });

  it('validates response against schema and returns typed data', async () => {
    const schema = z.object({ name: z.string() });
    mockFetch.mockResolvedValueOnce(makeResponse({ name: 'Alice' }));
    const result = await fetcher('/api/test', { schema });
    expect(result.name).toBe('Alice');
  });

  it('throws FetcherError CLIENT_CONTRACT_VIOLATION when schema fails', async () => {
    const schema = z.object({ name: z.string() });
    mockFetch.mockResolvedValueOnce(makeResponse({ name: 123 }));
    await expect(fetcher('/api/test', { schema })).rejects.toMatchObject({
      status: 502,
      code: 'CLIENT_CONTRACT_VIOLATION',
    });
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await fetcher<undefined>('/api/test');
    expect(result).toBeUndefined();
  });

  it('throws FetcherError with upstream status and code on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(
        { error: { code: 'NOT_FOUND', message: 'resource not found', requestId: 'req-1' } },
        { status: 404 },
      ),
    );
    await expect(fetcher('/api/test')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'resource not found',
    });
  });

  it('sets tokenExpired=true when X-Token-Expired header is present', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(
        { error: { code: 'TOKEN_EXPIRED', message: 'expired' } },
        { status: 401, headers: { 'X-Token-Expired': 'true' } },
      ),
    );
    let caught: FetcherError | null = null;
    try {
      await fetcher('/api/test');
    } catch (err: unknown) {
      if (err instanceof FetcherError) caught = err;
    }
    expect(caught).not.toBeNull();
    expect(caught?.tokenExpired).toBe(true);
    expect(caught?.status).toBe(401);
  });

  it('sets tokenExpired=false when X-Token-Expired header is absent', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ error: { code: 'UNAUTHORIZED', message: 'unauthorized' } }, { status: 401 }),
    );
    let caught: FetcherError | null = null;
    try {
      await fetcher('/api/test');
    } catch (err: unknown) {
      if (err instanceof FetcherError) caught = err;
    }
    expect(caught?.tokenExpired).toBe(false);
  });

  it('throws FetcherError INVALID_JSON when body is not valid JSON', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    );
    await expect(fetcher('/api/test')).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
  });

  it('sets Content-Type: application/json when body is provided', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: true }));
    await fetcher('/api/test', { method: 'POST', body: JSON.stringify({ x: 1 }) });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
  });

  it('attaches X-Request-Id header on every call', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: true }));
    await fetcher('/api/test');
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get('X-Request-Id')).toBeTruthy();
  });
});

describe('postJson', () => {
  it('calls fetcher with method POST and serialised body', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ id: 1 }));
    await postJson('/api/test', { name: 'test' });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/test');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe(JSON.stringify({ name: 'test' }));
  });
});
