// auth flow 테스트 — Amplify / fetch / SecureStore 는 모두 mock.
// 본 테스트는 "wire 가 올바르게 연결되었는지" 검증 — Cognito 실제 호출, BFF 실제
// 호출, SecureStore 실제 저장은 별도 통합 / E2E 단계에서 검증.

jest.mock('aws-amplify/auth', () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  signUp: jest.fn(),
  confirmSignUp: jest.fn(),
  fetchAuthSession: jest.fn(),
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
  confirmSignUp as amplifyConfirmSignUp,
  fetchAuthSession,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
} from 'aws-amplify/auth';
import * as SecureStore from 'expo-secure-store';

import { ApiError } from '../../src/lib/api-client';
import { getAccessToken, getRefreshToken } from '../../src/lib/secure-store';
import { confirmSignUpAndLogin, signIn, signOut, signUp } from '../../src/services/auth';

const amplifySignInMock = amplifySignIn as jest.MockedFunction<typeof amplifySignIn>;
const amplifySignOutMock = amplifySignOut as jest.MockedFunction<typeof amplifySignOut>;
const amplifySignUpMock = amplifySignUp as jest.MockedFunction<typeof amplifySignUp>;
const amplifyConfirmSignUpMock = amplifyConfirmSignUp as jest.MockedFunction<typeof amplifyConfirmSignUp>;
const fetchAuthSessionMock = fetchAuthSession as jest.MockedFunction<typeof fetchAuthSession>;
const resetSecureStoreMemory = (SecureStore as unknown as { __resetMemory: () => void }).__resetMemory;

describe('auth.signIn()', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSecureStoreMemory();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function mockCognitoSignInSuccess(idToken: string): void {
    amplifySignInMock.mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' },
    } as Awaited<ReturnType<typeof amplifySignIn>>);
    fetchAuthSessionMock.mockResolvedValue({
      tokens: { idToken: { toString: (): string => idToken } },
    } as unknown as Awaited<ReturnType<typeof fetchAuthSession>>);
  }

  function mockBffJsonResponse(status: number, body: unknown): void {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  it('성공 경로: Cognito SRP → BFF /login → SecureStore 저장', async () => {
    mockCognitoSignInSuccess('cognito-id-token-A');
    mockBffJsonResponse(200, {
      access_token: 'access-A',
      refresh_token: 'refresh-A',
    });

    const tokens = await signIn({ email: 'a@b.co', password: 'pw' });

    expect(tokens.access_token).toBe('access-A');
    expect(tokens.refresh_token).toBe('refresh-A');
    expect(amplifySignInMock).toHaveBeenCalledWith({ username: 'a@b.co', password: 'pw' });

    // BFF 호출 확인 — body 에 email + id_token, Authorization 미부착 (로그인 자체는 anonymous).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('http://localhost:3000/api/auth/mobile/login');
    expect(calledInit.method).toBe('POST');
    const sentBody: unknown = JSON.parse(calledInit.body as string);
    expect(sentBody).toEqual({ email: 'a@b.co', id_token: 'cognito-id-token-A' });

    // SecureStore 검증
    expect(await getAccessToken()).toBe('access-A');
    expect(await getRefreshToken()).toBe('refresh-A');
  });

  it('Cognito 가 isSignedIn=false (MFA 등 추가 단계) → throw, BFF 미호출, SecureStore 미저장', async () => {
    amplifySignInMock.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_SMS_CODE' },
    } as Awaited<ReturnType<typeof amplifySignIn>>);

    await expect(signIn({ email: 'a@b.co', password: 'pw' })).rejects.toThrow(/CONFIRM_SIGN_IN_WITH_SMS_CODE/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await getAccessToken()).toBeNull();
  });

  it('BFF 가 401 (e.g. INVALID_CREDENTIALS) → ApiError throw, SecureStore 미저장', async () => {
    mockCognitoSignInSuccess('cognito-id-token-B');
    mockBffJsonResponse(401, {
      error: { code: 'INVALID_CREDENTIALS', message: 'bad creds' },
    });

    await expect(signIn({ email: 'a@b.co', password: 'pw' })).rejects.toBeInstanceOf(ApiError);
    try {
      await signIn({ email: 'a@b.co', password: 'pw' });
    } catch (err) {
      if (err instanceof ApiError) {
        expect(err.status).toBe(401);
        expect(err.code).toBe('INVALID_CREDENTIALS');
      }
    }
    expect(await getAccessToken()).toBeNull();
  });

  it('Cognito session 에 idToken 미존재 → throw', async () => {
    amplifySignInMock.mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' },
    } as Awaited<ReturnType<typeof amplifySignIn>>);
    fetchAuthSessionMock.mockResolvedValue({
      tokens: undefined,
    } as Awaited<ReturnType<typeof fetchAuthSession>>);

    await expect(signIn({ email: 'a@b.co', password: 'pw' })).rejects.toThrow(/idToken 미존재/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('auth.signOut()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSecureStoreMemory();
  });

  it('SecureStore 토큰 먼저 제거 + Amplify signOut 호출', async () => {
    // 사전 토큰 저장
    await SecureStore.setItemAsync('celebbase.auth.access_token', 'a');
    await SecureStore.setItemAsync('celebbase.auth.refresh_token', 'r');
    amplifySignOutMock.mockResolvedValue();

    await signOut();

    expect(amplifySignOutMock).toHaveBeenCalledTimes(1);
    expect(await getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });

  it('Amplify signOut 실패해도 SecureStore 는 이미 비워진 상태 (best-effort)', async () => {
    await SecureStore.setItemAsync('celebbase.auth.access_token', 'a');
    amplifySignOutMock.mockRejectedValue(new Error('network'));

    // signOut 자체는 throw 하지 않음 (catch 처리)
    await expect(signOut()).resolves.toBeUndefined();
    expect(await getAccessToken()).toBeNull();
  });
});

describe('auth.signUp()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Cognito signUp 호출 + 코드 발송 단계면 CONFIRM_SIGN_UP 반환', async () => {
    amplifySignUpMock.mockResolvedValue({
      isSignUpComplete: false,
      nextStep: { signUpStep: 'CONFIRM_SIGN_UP' },
    } as Awaited<ReturnType<typeof amplifySignUp>>);

    const result = await signUp({ email: 'a@b.co', password: 'Pass123!', display_name: 'Alice' });

    expect(result.nextStep).toBe('CONFIRM_SIGN_UP');
    expect(amplifySignUpMock).toHaveBeenCalledWith({
      username: 'a@b.co',
      password: 'Pass123!',
      options: {
        userAttributes: { email: 'a@b.co', name: 'Alice' },
      },
    });
  });

  it('Cognito 가 자동 가입 완료 (DONE) — confirmation 불필요', async () => {
    amplifySignUpMock.mockResolvedValue({
      isSignUpComplete: true,
      nextStep: { signUpStep: 'DONE' },
    } as Awaited<ReturnType<typeof amplifySignUp>>);

    const result = await signUp({ email: 'a@b.co', password: 'P', display_name: 'A' });
    expect(result.nextStep).toBe('DONE');
  });

  it('Cognito 가 throw 하면 그대로 전파 (예: UsernameExistsException)', async () => {
    amplifySignUpMock.mockRejectedValue(
      Object.assign(new Error('email exists'), { name: 'UsernameExistsException' }),
    );

    await expect(
      signUp({ email: 'a@b.co', password: 'p', display_name: 'A' }),
    ).rejects.toThrow(/email exists/);
  });
});

describe('auth.confirmSignUpAndLogin()', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSecureStoreMemory();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function mockCognitoSignInSuccess(idToken: string): void {
    amplifySignInMock.mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' },
    } as Awaited<ReturnType<typeof amplifySignIn>>);
    fetchAuthSessionMock.mockResolvedValue({
      tokens: { idToken: { toString: (): string => idToken } },
    } as unknown as Awaited<ReturnType<typeof fetchAuthSession>>);
  }

  it('성공 경로: confirmSignUp → signIn → BFF /signup → SecureStore', async () => {
    amplifyConfirmSignUpMock.mockResolvedValue({
      isSignUpComplete: true,
      nextStep: { signUpStep: 'DONE' },
    } as Awaited<ReturnType<typeof amplifyConfirmSignUp>>);
    mockCognitoSignInSuccess('id-token-X');
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: 'access-X', refresh_token: 'refresh-X' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const tokens = await confirmSignUpAndLogin({
      email: 'a@b.co',
      code: '123456',
      password: 'pw',
      display_name: 'Alice',
    });

    expect(tokens.access_token).toBe('access-X');
    expect(amplifyConfirmSignUpMock).toHaveBeenCalledWith({
      username: 'a@b.co',
      confirmationCode: '123456',
    });
    expect(amplifySignInMock).toHaveBeenCalledWith({ username: 'a@b.co', password: 'pw' });

    // BFF /signup 호출 — body 에 email, display_name, id_token
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('http://localhost:3000/api/auth/mobile/signup');
    const sentBody: unknown = JSON.parse(calledInit.body as string);
    expect(sentBody).toEqual({ email: 'a@b.co', display_name: 'Alice', id_token: 'id-token-X' });

    expect(await getAccessToken()).toBe('access-X');
    expect(await getRefreshToken()).toBe('refresh-X');
  });

  it('confirmSignUp 실패 (코드 불일치) → throw, BFF 미호출, SecureStore 미저장', async () => {
    amplifyConfirmSignUpMock.mockRejectedValue(
      Object.assign(new Error('Invalid verification code'), { name: 'CodeMismatchException' }),
    );

    await expect(
      confirmSignUpAndLogin({ email: 'a@b.co', code: 'wrong', password: 'pw', display_name: 'A' }),
    ).rejects.toThrow(/Invalid verification code/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await getAccessToken()).toBeNull();
  });

  it('BFF /signup 4xx (EMAIL_ALREADY_EXISTS) → ApiError, SecureStore 미저장', async () => {
    amplifyConfirmSignUpMock.mockResolvedValue({
      isSignUpComplete: true,
      nextStep: { signUpStep: 'DONE' },
    } as Awaited<ReturnType<typeof amplifyConfirmSignUp>>);
    mockCognitoSignInSuccess('id-token-Y');
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'EMAIL_ALREADY_EXISTS', message: 'dup' } }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      confirmSignUpAndLogin({ email: 'a@b.co', code: '123', password: 'pw', display_name: 'A' }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(await getAccessToken()).toBeNull();
  });
});
