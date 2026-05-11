// expo-secure-store 는 native module 이라 jest 환경에서 mock 필요. 인메모리
// store 로 대체해 get/set/delete 의미를 그대로 시뮬레이션.
jest.mock('expo-secure-store', () => {
  const memory = new Map<string, string>();
  return {
    getItemAsync: jest.fn((key: string): Promise<string | null> => {
      return Promise.resolve(memory.get(key) ?? null);
    }),
    setItemAsync: jest.fn((key: string, value: string): Promise<void> => {
      memory.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string): Promise<void> => {
      memory.delete(key);
      return Promise.resolve();
    }),
    __resetMemory: (): void => {
      memory.clear();
    },
  };
});

import * as SecureStore from 'expo-secure-store';

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  setTokens,
} from '../../src/lib/secure-store';

// jest.mock 으로 주입한 __resetMemory 헬퍼에 접근.
const resetMemory = (SecureStore as unknown as { __resetMemory: () => void }).__resetMemory;

describe('secure-store', () => {
  beforeEach(() => {
    resetMemory();
    jest.clearAllMocks();
  });

  it('미저장 상태에서 getAccessToken / getRefreshToken 은 null 을 반환한다', async () => {
    expect(await getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });

  it('setTokens 후 getAccessToken / getRefreshToken 이 저장한 값을 반환한다', async () => {
    await setTokens({ access_token: 'access-A', refresh_token: 'refresh-A' });
    expect(await getAccessToken()).toBe('access-A');
    expect(await getRefreshToken()).toBe('refresh-A');
  });

  it('setTokens 는 spec.md §4.2 정합 키 네임스페이스로 저장한다', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('celebbase.auth.access_token', 'a');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('celebbase.auth.refresh_token', 'r');
  });

  it('setAccessToken 은 새 값으로 덮어쓴다 (rotation)', async () => {
    await setAccessToken('old');
    await setAccessToken('new');
    expect(await getAccessToken()).toBe('new');
  });

  it('setRefreshToken 은 새 값으로 덮어쓴다 (rotation)', async () => {
    await setRefreshToken('old');
    await setRefreshToken('new');
    expect(await getRefreshToken()).toBe('new');
  });

  it('setAccessToken 은 빈 문자열을 거부한다', async () => {
    await expect(setAccessToken('')).rejects.toThrow(/빈 문자열/);
  });

  it('setRefreshToken 은 빈 문자열을 거부한다', async () => {
    await expect(setRefreshToken('')).rejects.toThrow(/빈 문자열/);
  });

  it('clearTokens 는 access + refresh 모두 제거한다', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    await clearTokens();
    expect(await getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('celebbase.auth.access_token');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('celebbase.auth.refresh_token');
  });
});
