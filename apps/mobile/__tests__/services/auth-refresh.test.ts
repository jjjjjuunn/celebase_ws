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

import { getAccessToken, getRefreshToken, setTokens } from '../../src/lib/secure-store';
import { refreshTokens } from '../../src/services/auth-refresh';

const resetSecureStoreMemory = (SecureStore as unknown as { __resetMemory: () => void }).__resetMemory;

describe('refreshTokens()', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSecureStoreMemory();
    process.env['EXPO_PUBLIC_USER_SERVICE_URL'] = 'http://localhost:3001';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function mockResponse(status: number, body: unknown): void {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  it('refresh_token 없음 → expired_or_missing (BFF 미호출)', async () => {
    const result = await refreshTokens();
    expect(result.status).toBe('expired_or_missing');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('success: 200 + 새 토큰 → SecureStore 갱신 (rotation)', async () => {
    await setTokens({ access_token: 'old-a', refresh_token: 'old-r' });
    mockResponse(200, { access_token: 'new-a', refresh_token: 'new-r' });

    const result = await refreshTokens();
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.tokens.access_token).toBe('new-a');
      expect(result.tokens.refresh_token).toBe('new-r');
    }
    expect(await getAccessToken()).toBe('new-a');
    expect(await getRefreshToken()).toBe('new-r');

    // user-service 직접 호출 검증
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('http://localhost:3001/auth/refresh');
    const sentBody: unknown = JSON.parse(calledInit.body as string);
    expect(sentBody).toEqual({ refresh_token: 'old-r' });
  });

  it('401 REFRESH_EXPIRED_OR_MISSING → expired_or_missing (clearTokens 호출 X)', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    mockResponse(401, { error: { code: 'REFRESH_EXPIRED_OR_MISSING', message: 'expired' } });

    const result = await refreshTokens();
    expect(result.status).toBe('expired_or_missing');
    // 일반 만료는 자동 폐기 안 함 — UI 가 /login 으로 라우팅하고 SecureStore 는 그때 비움
    expect(await getRefreshToken()).toBe('r');
  });

  it('401 TOKEN_REUSE_DETECTED → reuse_detected + 로컬 토큰 즉시 폐기', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    mockResponse(401, { error: { code: 'TOKEN_REUSE_DETECTED', message: 'reuse' } });

    const result = await refreshTokens();
    expect(result.status).toBe('reuse_detected');
    expect(await getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });

  it('401 REFRESH_REVOKED → revoked + 로컬 토큰 폐기', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    mockResponse(401, { error: { code: 'REFRESH_REVOKED', message: 'revoked' } });

    const result = await refreshTokens();
    expect(result.status).toBe('revoked');
    expect(await getRefreshToken()).toBeNull();
  });

  it('401 MALFORMED → malformed + 로컬 토큰 폐기 (corruption 방어)', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    mockResponse(401, { error: { code: 'MALFORMED', message: 'bad jwt' } });

    const result = await refreshTokens();
    expect(result.status).toBe('malformed');
    expect(await getRefreshToken()).toBeNull();
  });

  it('401 ACCOUNT_DELETED → account_deleted + 로컬 토큰 폐기', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    mockResponse(401, { error: { code: 'ACCOUNT_DELETED', message: 'deleted' } });

    const result = await refreshTokens();
    expect(result.status).toBe('account_deleted');
    expect(await getRefreshToken()).toBeNull();
  });

  it('401 미지정 code → 안전 default (expired_or_missing) + 로컬 폐기', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    mockResponse(401, { error: { code: 'UNKNOWN_FUTURE_CODE', message: 'x' } });

    const result = await refreshTokens();
    expect(result.status).toBe('expired_or_missing');
    expect(await getRefreshToken()).toBeNull();
  });

  it('서버 500 (네트워크 / 5xx) → throw (호출자 위임)', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    mockResponse(500, { error: { code: 'INTERNAL', message: 'oops' } });

    await expect(refreshTokens()).rejects.toThrow();
    // 5xx 는 자동 폐기 X — 일시적 장애일 수도 있고 호출자 정책에 따라 재시도 가능
    expect(await getRefreshToken()).toBe('r');
  });

  it('200 응답이 빈 토큰 포함 → malformed (서버 계약 위반 방어)', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    mockResponse(200, { access_token: '', refresh_token: '' });

    const result = await refreshTokens();
    expect(result.status).toBe('malformed');
  });
});
