// social-auth (Hosted-UI Google/Apple) 테스트 — IMPL-MOBILE-SOCIAL-001.
// Amplify (signInWithRedirect / fetchAuthSession / signOut), Hub, SecureStore,
// fetch 모두 mock. 검증 초점: one-shot Hub listener 가 redirect 완료 이벤트에서
// id_token → BFF 교환 → SecureStore 저장으로 올바르게 연결되는지, 그리고
// 409 / 실패 이벤트가 throw 로 전파되는지.
//
// Hub.listen 은 inline jest.fn() 으로 mock 한 뒤 beforeEach 에서 mockImplementation
// 으로 동작을 주입한다 (auth.test.ts 패턴 — 팩토리에서 외부 변수 캡처 시 TDZ 함정).

type HubHandler = (capsule: { payload: { event: string } }) => void;

jest.mock('aws-amplify/auth', () => ({
  signInWithRedirect: jest.fn(),
  signOut: jest.fn(),
  fetchAuthSession: jest.fn(),
}));

jest.mock('aws-amplify/utils', () => ({
  Hub: { listen: jest.fn() },
}));

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

import {
  fetchAuthSession,
  signInWithRedirect,
  signOut as amplifySignOut,
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import * as SecureStore from 'expo-secure-store';

import { signInWithSocial } from '../../src/services/social-auth';
import { getAccessToken, getRefreshToken } from '../../src/lib/secure-store';
import { __resetAuthEvents } from '../../src/lib/auth-events';

const signInWithRedirectMock = signInWithRedirect as jest.MockedFunction<typeof signInWithRedirect>;
const fetchAuthSessionMock = fetchAuthSession as jest.MockedFunction<typeof fetchAuthSession>;
const amplifySignOutMock = amplifySignOut as jest.MockedFunction<typeof amplifySignOut>;
const hubListenMock = Hub.listen as unknown as jest.Mock;
const resetSecureStore = (SecureStore as unknown as { __resetMemory: () => void }).__resetMemory;

// captured by the Hub.listen mock so tests can drive the redirect-completion event.
let capturedHandler: HubHandler | undefined;
const stopListen = jest.fn();

// Minimal id_token session shape consumed by completeSocialExchange.
function fakeSession(email: string): unknown {
  return {
    tokens: {
      idToken: {
        toString: (): string => 'fake.id.token',
        payload: { email },
      },
    },
  };
}

function fakeBffResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('signInWithSocial', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSecureStore();
    __resetAuthEvents();
    capturedHandler = undefined;
    hubListenMock.mockImplementation((_channel: string, handler: HubHandler) => {
      capturedHandler = handler;
      return stopListen;
    });
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  it('exchanges id_token at the BFF and stores internal tokens on redirect completion', async () => {
    signInWithRedirectMock.mockResolvedValue(undefined);
    fetchAuthSessionMock.mockResolvedValue(fakeSession('user@example.com') as never);
    fetchSpy.mockResolvedValue(
      fakeBffResponse({ access_token: 'ACCESS', refresh_token: 'REFRESH' }),
    );

    const promise = signInWithSocial('Google');
    // listener registered synchronously in the Promise executor.
    expect(capturedHandler).toBeDefined();
    // simulate Amplify completing the redirect round-trip.
    capturedHandler?.({ payload: { event: 'signInWithRedirect' } });

    const tokens = await promise;

    expect(tokens.access_token).toBe('ACCESS');
    expect(signInWithRedirectMock).toHaveBeenCalledWith({ provider: 'Google' });
    expect(await getAccessToken()).toBe('ACCESS');
    expect(await getRefreshToken()).toBe('REFRESH');
    // BFF called with the email pulled from the verified id_token claim.
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'user@example.com',
      id_token: 'fake.id.token',
    });
    // listener cleaned up.
    expect(stopListen).toHaveBeenCalled();
  });

  it('propagates the BFF 409 collision and signs the Cognito session back out', async () => {
    signInWithRedirectMock.mockResolvedValue(undefined);
    fetchAuthSessionMock.mockResolvedValue(fakeSession('dupe@example.com') as never);
    fetchSpy.mockResolvedValue(
      fakeBffResponse(
        { error: { code: 'ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER', message: 'exists' } },
        409,
      ),
    );

    const promise = signInWithSocial('Apple');
    capturedHandler?.({ payload: { event: 'signInWithRedirect' } });

    await expect(promise).rejects.toMatchObject({
      code: 'ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER',
      status: 409,
    });
    // no tokens persisted; Cognito session reset so a retry starts clean.
    expect(await getAccessToken()).toBeNull();
    expect(amplifySignOutMock).toHaveBeenCalled();
    expect(stopListen).toHaveBeenCalled();
  });

  it('rejects when Amplify emits signInWithRedirect_failure', async () => {
    signInWithRedirectMock.mockResolvedValue(undefined);

    const promise = signInWithSocial('Google');
    capturedHandler?.({ payload: { event: 'signInWithRedirect_failure' } });

    await expect(promise).rejects.toThrow(/소셜 로그인에 실패/);
    expect(stopListen).toHaveBeenCalled();
  });

  it('cleans up the listener when signInWithRedirect itself rejects (user cancel)', async () => {
    signInWithRedirectMock.mockRejectedValue(new Error('UserCancel'));

    await expect(signInWithSocial('Google')).rejects.toThrow('UserCancel');
    expect(stopListen).toHaveBeenCalled();
  });
});
