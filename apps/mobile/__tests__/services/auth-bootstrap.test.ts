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

import { setTokens, setAccessToken, setRefreshToken, clearTokens } from '../../src/lib/secure-store';
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

  it('토큰 둘 다 없음 → login', async () => {
    await expect(bootstrapSession()).resolves.toBe('login');
  });

  it('access_token 만 있음 (비정상 상태) → login', async () => {
    await setAccessToken('a');
    await expect(bootstrapSession()).resolves.toBe('login');
  });

  it('refresh_token 만 있음 (비정상 상태) → login', async () => {
    await setRefreshToken('r');
    await expect(bootstrapSession()).resolves.toBe('login');
  });

  it('clearTokens 후 → login', async () => {
    await setTokens({ access_token: 'a', refresh_token: 'r' });
    await clearTokens();
    await expect(bootstrapSession()).resolves.toBe('login');
  });
});
