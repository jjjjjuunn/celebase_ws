import { openMealPlanStream, type StreamCallbacks } from '../useMealPlanStream';

const mockFetch = jest.spyOn(globalThis, 'fetch');

// Controllable WebSocket mock that allows tests to fire WS events
class ControllableWebSocket {
  static CONNECTING = 0 as const;
  static OPEN = 1 as const;
  static CLOSING = 2 as const;
  static CLOSED = 3 as const;

  private static _instances: ControllableWebSocket[] = [];
  static get last(): ControllableWebSocket | null {
    return ControllableWebSocket._instances[ControllableWebSocket._instances.length - 1] ?? null;
  }
  static reset(): void {
    ControllableWebSocket._instances = [];
  }

  readyState: number = ControllableWebSocket.CONNECTING;
  url: string;

  private handlers = new Map<string, ((event: unknown) => void)[]>();

  constructor(url: string) {
    this.url = url;
    ControllableWebSocket._instances.push(this);
  }

  close(): void {
    this.readyState = ControllableWebSocket.CLOSED;
    this._trigger('close', { wasClean: true });
  }

  send(): void {}

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const fn =
      typeof listener === 'function' ? listener : (listener as EventListenerObject).handleEvent;
    const list = this.handlers.get(type) ?? [];
    list.push(fn as (event: unknown) => void);
    this.handlers.set(type, list);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const fn =
      typeof listener === 'function' ? listener : (listener as EventListenerObject).handleEvent;
    const list = this.handlers.get(type) ?? [];
    this.handlers.set(type, list.filter((h) => h !== fn));
  }

  dispatchEvent(): boolean {
    return true;
  }

  _trigger(type: string, event: unknown): void {
    for (const h of this.handlers.get(type) ?? []) {
      h(event);
    }
  }

  _open(): void {
    this.readyState = ControllableWebSocket.OPEN;
    this._trigger('open', {});
  }

  _message(data: unknown): void {
    this._trigger('message', { data: JSON.stringify(data) });
  }

  _error(): void {
    this._trigger('error', {});
  }

  _close(wasClean = false): void {
    this.readyState = ControllableWebSocket.CLOSED;
    this._trigger('close', { wasClean });
  }
}

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeTicketResponse(): Record<string, unknown> {
  return {
    ticket: 'tok-test-abc',
    ws_url: 'wss://ws.celebbase.test/stream',
    meal_plan_id: '0190abcd-ef01-7234-8567-000000000001',
    expires_at: '2026-04-20T00:00:00Z',
  };
}

function makeCallbacks(
  overrides: Partial<StreamCallbacks> = {},
): StreamCallbacks & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    onConnecting: () => {
      calls.push('connecting');
    },
    onStreaming: () => {
      calls.push('streaming');
    },
    onProgress: (pct, msg) => {
      calls.push(`progress:${String(pct)}:${msg}`);
    },
    onComplete: (id) => {
      calls.push(`complete:${id}`);
    },
    onError: (msg) => {
      calls.push(`error:${msg}`);
    },
    ...overrides,
  };
}

function flushPromises(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  ControllableWebSocket.reset();
  mockFetch.mockReset();
  (globalThis as Record<string, unknown>)['WebSocket'] = ControllableWebSocket;
});

afterEach(() => {
  mockFetch.mockReset();
});

describe('openMealPlanStream', () => {
  it('calls onConnecting immediately and builds correct WS URL', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(makeTicketResponse()));
    const cb = makeCallbacks();
    const abort = new AbortController();

    const promise = openMealPlanStream('plan-001', cb, abort.signal);

    expect(cb.calls).toContain('connecting');

    await flushPromises();
    const ws = ControllableWebSocket.last;
    expect(ws).not.toBeNull();
    expect(ws!.url).toBe('wss://ws.celebbase.test/stream?ticket=tok-test-abc');

    await promise;
  });

  it('calls onStreaming after WS open event', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(makeTicketResponse()));
    const cb = makeCallbacks();
    const abort = new AbortController();

    openMealPlanStream('plan-002', cb, abort.signal);
    await flushPromises();

    ControllableWebSocket.last!._open();
    expect(cb.calls).toContain('streaming');
  });

  it('dispatches progress events with pct and message', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(makeTicketResponse()));
    const cb = makeCallbacks();
    const abort = new AbortController();

    openMealPlanStream('plan-003', cb, abort.signal);
    await flushPromises();

    const ws = ControllableWebSocket.last!;
    ws._open();
    ws._message({ type: 'progress', pct: 30, message: 'Preparing ingredients…' });
    ws._message({ type: 'progress', pct: 70, message: 'Building day 3…' });

    expect(cb.calls).toContain('progress:30:Preparing ingredients…');
    expect(cb.calls).toContain('progress:70:Building day 3…');
  });

  it('calls onComplete with meal_plan_id and closes WS on complete event', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(makeTicketResponse()));
    const cb = makeCallbacks();
    const abort = new AbortController();

    openMealPlanStream('plan-004', cb, abort.signal);
    await flushPromises();

    const ws = ControllableWebSocket.last!;
    ws._open();
    ws._message({ type: 'complete', meal_plan_id: 'finished-plan-uuid' });

    expect(cb.calls).toContain('complete:finished-plan-uuid');
    expect(ws.readyState).toBe(ControllableWebSocket.CLOSED);
  });

  it('calls onError with server error message on error event', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(makeTicketResponse()));
    const cb = makeCallbacks();
    const abort = new AbortController();

    openMealPlanStream('plan-005', cb, abort.signal);
    await flushPromises();

    const ws = ControllableWebSocket.last!;
    ws._open();
    ws._message({ type: 'error', code: 'GENERATION_FAILED', message: 'Calorie bounds exceeded' });

    expect(cb.calls).toContain('error:Calorie bounds exceeded');
    expect(ws.readyState).toBe(ControllableWebSocket.CLOSED);
  });

  it('calls onError when WS fires error event', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(makeTicketResponse()));
    const cb = makeCallbacks();
    const abort = new AbortController();

    openMealPlanStream('plan-006', cb, abort.signal);
    await flushPromises();

    ControllableWebSocket.last!._error();

    expect(cb.calls).toContain('error:WebSocket connection error');
  });

  it('calls onError when WS closes unexpectedly (wasClean=false)', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(makeTicketResponse()));
    const cb = makeCallbacks();
    const abort = new AbortController();

    openMealPlanStream('plan-007', cb, abort.signal);
    await flushPromises();

    ControllableWebSocket.last!._open();
    ControllableWebSocket.last!._close(false);

    expect(cb.calls).toContain('error:Connection lost unexpectedly');
  });

  it('does NOT call onError on clean close after complete', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(makeTicketResponse()));
    const cb = makeCallbacks();
    const abort = new AbortController();

    openMealPlanStream('plan-008', cb, abort.signal);
    await flushPromises();

    const ws = ControllableWebSocket.last!;
    ws._open();
    ws._message({ type: 'complete', meal_plan_id: 'mp-done' });

    const errorCalls = cb.calls.filter((c) => c.startsWith('error:'));
    expect(errorCalls).toHaveLength(0);
    expect(cb.calls).toContain('complete:mp-done');
  });

  it('calls onError when ticket fetch returns a non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, 401),
    );
    const cb = makeCallbacks();
    const abort = new AbortController();

    await openMealPlanStream('plan-009', cb, abort.signal);

    expect(cb.calls.some((c) => c.startsWith('error:'))).toBe(true);
    expect(ControllableWebSocket.last).toBeNull();
  });

  it('does NOT call onError when abort signal fires before fetch resolves', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, 403),
    );
    const cb = makeCallbacks();
    const abort = new AbortController();
    abort.abort();

    await openMealPlanStream('plan-010', cb, abort.signal);

    expect(cb.calls).toContain('connecting');
    expect(cb.calls.filter((c) => c.startsWith('error:'))).toHaveLength(0);
    expect(ControllableWebSocket.last).toBeNull();
  });

  it('returns WebSocket instance on successful connection', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(makeTicketResponse()));
    const cb = makeCallbacks();
    const abort = new AbortController();

    const wsPromise = openMealPlanStream('plan-011', cb, abort.signal);
    await flushPromises();

    const ws = await wsPromise;
    expect(ws).toBe(ControllableWebSocket.last);
    expect(ws).not.toBeNull();
  });

  it('returns null when fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'));
    const cb = makeCallbacks();
    const abort = new AbortController();

    const ws = await openMealPlanStream('plan-012', cb, abort.signal);

    expect(ws).toBeNull();
    expect(cb.calls).toContain('error:network failure');
  });
});
