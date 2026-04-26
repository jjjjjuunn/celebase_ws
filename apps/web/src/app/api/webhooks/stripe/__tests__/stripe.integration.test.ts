import { POST } from '../route';

function makeRequest(opts?: {
  signature?: string | null;
  body?: string;
  requestId?: string;
}): Parameters<typeof POST>[0] {
  return {
    headers: {
      get(name: string) {
        const lower = name.toLowerCase();
        if (lower === 'stripe-signature') {
          return opts?.signature === undefined ? 'sig_test_1' : opts.signature;
        }
        if (lower === 'x-request-id') return opts?.requestId ?? null;
        return null;
      },
    },
    cookies: { get() { return undefined; } },
    text: async () => opts?.body ?? '{}',
  } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/webhooks/stripe', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 400 MISSING_SIGNATURE when Stripe-Signature header is absent', async () => {
    const res = await POST(makeRequest({ signature: null }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('MISSING_SIGNATURE');
  });

  it('returns 400 MISSING_SIGNATURE when Stripe-Signature header is empty string', async () => {
    const res = await POST(makeRequest({ signature: '' }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards raw body + Stripe-Signature to upstream and preserves 200 status', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const rawBody = '{"id":"evt_1","type":"checkout.session.completed"}';
    const res = await POST(
      makeRequest({
        signature: 'sig_abc',
        body: rawBody,
        requestId: 'req-stripe-1',
      }),
    );

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('http://localhost:3004/webhooks/stripe');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(rawBody);
    const headers = init.headers as Record<string, string>;
    expect(headers['Stripe-Signature']).toBe('sig_abc');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Request-Id']).toBe('req-stripe-1');
  });

  it('preserves upstream 400 status verbatim', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'INVALID_SIGNATURE', message: 'bad sig' } }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    );
    const res = await POST(
      makeRequest({ signature: 'sig_bad', body: '{}' }),
    );

    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('returns 504 UPSTREAM_TIMEOUT on TimeoutError', async () => {
    const err = new Error('aborted');
    err.name = 'TimeoutError';
    fetchSpy.mockRejectedValue(err);
    const res = await POST(makeRequest({ signature: 'sig_x' }));

    expect(res.status).toBe(504);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('returns 502 UPSTREAM_UNREACHABLE on network error', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await POST(makeRequest({ signature: 'sig_x' }));

    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNREACHABLE');
  });

  it('preserves upstream 5xx status verbatim', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'INTERNAL' } }), {
        status: 500,
      }),
    );
    const res = await POST(makeRequest({ signature: 'sig_x' }));
    expect(res.status).toBe(500);
  });

  it('echoes X-Request-Id in response', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    const res = await POST(
      makeRequest({ signature: 'sig_x', requestId: 'trace-xyz' }),
    );
    expect(res.headers.get('X-Request-Id')).toBe('trace-xyz');
  });
});
