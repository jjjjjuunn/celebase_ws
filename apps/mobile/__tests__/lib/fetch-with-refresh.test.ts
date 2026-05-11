jest.mock('expo-secure-store', () => {
  const memory = new Map<string, string>();
  return {
    getItemAsync: jest.fn((k: string): Promise<string | null> => Promise.resolve(memory.get(k) ?? null)),
    setItemAsync: jest.fn((k: string, v: string): Promise<void> => {
      memory.set(k, v);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((k: string): Promise<void> => {
      memory.delete(k);
      return Promise.resolve();
    }),
    __resetMemory: (): void => {
      memory.clear();
    },
  };
});

import * as SecureStore from 'expo-secure-store';

import { ApiError } from '../../src/lib/api-client';
import {
  __resetAuthEvents,
  onLogoutSignal,
  type LogoutReason,
} from '../../src/lib/auth-events';
import {
  __resetPendingRefresh,
  authedFetch,
} from '../../src/lib/fetch-with-refresh';
import { setTokens } from '../../src/lib/secure-store';

const resetSecureStoreMemory = (SecureStore as unknown as { __resetMemory: () => void }).__resetMemory;

describe('authedFetch()', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSecureStoreMemory();
    __resetAuthEvents();
    __resetPendingRefresh();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    process.env['EXPO_PUBLIC_USER_SERVICE_URL'] = 'http://localhost:3001';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function makeResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('200 OK — Bearer 헤더 부착 + JSON 응답 파싱', async () => {
    await setTokens({ access_token: 'access-1', refresh_token: 'refresh-1' });
    fetchSpy.mockResolvedValueOnce(makeResponse(200, { ok: true, value: 42 }));

    const result = await authedFetch<{ ok: boolean; value: number }>('/api/protected');

    expect(result).toEqual({ ok: true, value: 42 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/protected');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer access-1');
  });

  it('POST + body — JSON 직렬화 + Content-Type 자동 부착', async () => {
    await setTokens({ access_token: 'access-1', refresh_token: 'refresh-1' });
    fetchSpy.mockResolvedValueOnce(makeResponse(200, { id: 'x' }));

    await authedFetch<{ id: string }>('/api/foo', {
      method: 'POST',
      body: { name: 'bar' },
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'bar' });
  });

  it('401 → refresh success → 새 토큰으로 재시도 200', async () => {
    await setTokens({ access_token: 'old-a', refresh_token: 'old-r' });
    fetchSpy
      .mockResolvedValueOnce(makeResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))
      .mockResolvedValueOnce(makeResponse(200, { access_token: 'new-a', refresh_token: 'new-r' }))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    const result = await authedFetch<{ ok: boolean }>('/api/protected');

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    // 3번째 호출 (재시도) 가 새 access_token 으로 가야 한다
    const [retryUrl, retryInit] = fetchSpy.mock.calls[2] as [string, RequestInit];
    expect(retryUrl).toBe('http://localhost:3000/api/protected');
    const retryHeaders = retryInit.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer new-a');
  });

  it('401 → REFRESH_EXPIRED_OR_MISSING → signalLogout 호출 + ApiError throw', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    fetchSpy
      .mockResolvedValueOnce(makeResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))
      .mockResolvedValueOnce(
        makeResponse(401, { error: { code: 'REFRESH_EXPIRED_OR_MISSING', message: 'expired' } }),
      );

    const reasons: LogoutReason[] = [];
    onLogoutSignal((reason) => reasons.push(reason));

    await expect(authedFetch('/api/protected')).rejects.toBeInstanceOf(ApiError);
    expect(reasons).toEqual(['expired_or_missing']);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // 원 요청 + refresh, 재시도 X
  });

  it('401 → TOKEN_REUSE_DETECTED → reuse_detected logout signal', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    fetchSpy
      .mockResolvedValueOnce(makeResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))
      .mockResolvedValueOnce(
        makeResponse(401, { error: { code: 'TOKEN_REUSE_DETECTED', message: 'reuse' } }),
      );

    const reasons: LogoutReason[] = [];
    onLogoutSignal((reason) => reasons.push(reason));

    await expect(authedFetch('/api/protected')).rejects.toBeInstanceOf(ApiError);
    expect(reasons).toEqual(['reuse_detected']);
  });

  it('single-flight: 동시 다중 401 — refresh 는 1회만 트리거', async () => {
    await setTokens({ access_token: 'old-a', refresh_token: 'old-r' });
    // 두 번의 보호 요청, 한 번의 refresh, 두 번의 재시도 = 총 5번
    fetchSpy
      .mockResolvedValueOnce(makeResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))
      .mockResolvedValueOnce(makeResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))
      .mockResolvedValueOnce(makeResponse(200, { access_token: 'new-a', refresh_token: 'new-r' }))
      .mockResolvedValueOnce(makeResponse(200, { ok: 'a' }))
      .mockResolvedValueOnce(makeResponse(200, { ok: 'b' }));

    const [a, b] = await Promise.all([
      authedFetch<{ ok: string }>('/api/a'),
      authedFetch<{ ok: string }>('/api/b'),
    ]);

    expect(a).toEqual({ ok: 'a' });
    expect(b).toEqual({ ok: 'b' });
    // refresh 호출 (user-service /auth/refresh) 은 정확히 1번
    const refreshCalls = fetchSpy.mock.calls.filter(
      ([url]) => typeof url === 'string' && url.includes('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it('refresh success → 재시도도 401 → throw (무한 루프 방지)', async () => {
    await setTokens({ access_token: 'old-a', refresh_token: 'old-r' });
    fetchSpy
      .mockResolvedValueOnce(makeResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))
      .mockResolvedValueOnce(makeResponse(200, { access_token: 'new-a', refresh_token: 'new-r' }))
      .mockResolvedValueOnce(makeResponse(401, { error: { code: 'PERMISSION_DENIED' } }));

    await expect(authedFetch('/api/protected')).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(3); // 재시도까지만, 4번째 X
  });

  it('네트워크 4xx (non-401) — refresh 안 함 + ApiError throw', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    fetchSpy.mockResolvedValueOnce(
      makeResponse(404, { error: { code: 'NOT_FOUND', message: 'gone' } }),
    );

    await expect(authedFetch('/api/missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
