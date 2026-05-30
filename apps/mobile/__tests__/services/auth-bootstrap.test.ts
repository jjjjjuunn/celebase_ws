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

import {
  setTokens,
  setAccessToken,
  setRefreshToken,
  clearTokens,
  getAccessToken,
} from '../../src/lib/secure-store';
import { bootstrapSession } from '../../src/services/auth-bootstrap';

const resetSecureStoreMemory = (SecureStore as unknown as { __resetMemory: () => void }).__resetMemory;

describe('bootstrapSession()', () => {
  beforeEach(() => {
    resetSecureStoreMemory();
  });

  it('두 토큰 모두 존재 → authenticated', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    await expect(bootstrapSession()).resolves.toBe('authenticated');
  });

  it('토큰 둘 다 없음 → guest', async () => {
    await expect(bootstrapSession()).resolves.toBe('guest');
  });

  it('access_token 만 있음 (비정상 상태) → guest + stale token 정리', async () => {
    await setAccessToken('a');
    await expect(bootstrapSession()).resolves.toBe('guest');
    // 게스트는 진짜 무토큰이어야 함 — stale access token 이 정리돼 public fetch 에
    // Bearer 가 안 붙는다(no-boot-kick 보장; Codex L3 hypothesis).
    await expect(getAccessToken()).resolves.toBeNull();
  });

  it('refresh_token 만 있음 (비정상 상태) → guest', async () => {
    await setRefreshToken('r');
    await expect(bootstrapSession()).resolves.toBe('guest');
  });

  it('clearTokens 후 → guest', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    await clearTokens();
    await expect(bootstrapSession()).resolves.toBe('guest');
  });
});
