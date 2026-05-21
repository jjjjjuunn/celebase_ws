// Native social-auth (Apple / Google) tests — IMPL-MOBILE-SOCIAL-NATIVE-001.
//
// expo-apple-authentication, @react-native-google-signin/google-signin,
// expo-secure-store, and fetch are all mocked. Focus: each native flow yields a
// provider id_token that is posted to /api/auth/mobile/login with the right
// `provider` discriminator + optional email, internal tokens are persisted, and
// cancellation surfaces as SocialCancelledError (the buttons map that to "no
// message"). A BFF 409 propagates as an ApiError.

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: jest.fn(),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
  },
  isSuccessResponse: jest.fn(),
  isErrorWithCode: jest.fn(() => false),
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
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

import * as AppleAuthentication from 'expo-apple-authentication';
import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';

import {
  signInWithApple,
  signInWithGoogle,
  signInWithSocial,
  SocialCancelledError,
} from '../../src/services/social-auth';
import { getAccessToken, getRefreshToken } from '../../src/lib/secure-store';
import { __resetAuthEvents } from '../../src/lib/auth-events';

const appleSignInMock = AppleAuthentication.signInAsync as jest.MockedFunction<
  typeof AppleAuthentication.signInAsync
>;
const googleSignInMock = GoogleSignin.signIn as jest.MockedFunction<typeof GoogleSignin.signIn>;
const googleConfigureMock = GoogleSignin.configure as jest.MockedFunction<
  typeof GoogleSignin.configure
>;
const isSuccessResponseMock = isSuccessResponse as unknown as jest.Mock;
const resetSecureStore = (SecureStore as unknown as { __resetMemory: () => void }).__resetMemory;

function fakeBffResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function bffBodyOf(fetchSpy: jest.SpyInstance): unknown {
  const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string);
}

describe('native social-auth', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSecureStore();
    __resetAuthEvents();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    process.env['EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'] = '222-ios.apps.googleusercontent.com';
    process.env['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'] = '111-web.apps.googleusercontent.com';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValue(
      fakeBffResponse({ access_token: 'ACCESS', refresh_token: 'REFRESH' }),
    );
  });

  // ── Apple ────────────────────────────────────────────────────────────────

  it('Apple: posts identityToken with provider:"apple" + email and stores tokens', async () => {
    appleSignInMock.mockResolvedValue({
      identityToken: 'apple.id.token',
      email: 'apple@example.com',
      fullName: null,
      user: 'apple-user-id',
      authorizationCode: null,
      realUserStatus: 1,
      state: null,
    } as Awaited<ReturnType<typeof AppleAuthentication.signInAsync>>);

    const tokens = await signInWithApple();

    expect(tokens.access_token).toBe('ACCESS');
    expect(await getAccessToken()).toBe('ACCESS');
    expect(await getRefreshToken()).toBe('REFRESH');
    expect(bffBodyOf(fetchSpy)).toEqual({
      id_token: 'apple.id.token',
      provider: 'apple',
      email: 'apple@example.com',
    });
  });

  it('Apple re-sign-in (no email): omits email from the body', async () => {
    appleSignInMock.mockResolvedValue({
      identityToken: 'apple.id.token',
      email: null,
      fullName: null,
      user: 'apple-user-id',
      authorizationCode: null,
      realUserStatus: 1,
      state: null,
    } as Awaited<ReturnType<typeof AppleAuthentication.signInAsync>>);

    await signInWithApple();

    expect(bffBodyOf(fetchSpy)).toEqual({
      id_token: 'apple.id.token',
      provider: 'apple',
    });
  });

  it('Apple cancel (ERR_REQUEST_CANCELED) → SocialCancelledError, no fetch', async () => {
    appleSignInMock.mockRejectedValue(Object.assign(new Error('canceled'), {
      code: 'ERR_REQUEST_CANCELED',
    }));

    await expect(signInWithApple()).rejects.toBeInstanceOf(SocialCancelledError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Apple missing identityToken → throws (no silent success)', async () => {
    appleSignInMock.mockResolvedValue({
      identityToken: null,
      email: 'apple@example.com',
      fullName: null,
      user: 'apple-user-id',
      authorizationCode: null,
      realUserStatus: 1,
      state: null,
    } as Awaited<ReturnType<typeof AppleAuthentication.signInAsync>>);

    await expect(signInWithApple()).rejects.toThrow(/identityToken/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── Google ───────────────────────────────────────────────────────────────

  it('Google: configures both client IDs, posts idToken with provider:"google"', async () => {
    isSuccessResponseMock.mockReturnValue(true);
    googleSignInMock.mockResolvedValue({
      type: 'success',
      data: { idToken: 'google.id.token', user: { email: 'g@example.com' } },
    } as Awaited<ReturnType<typeof GoogleSignin.signIn>>);

    const tokens = await signInWithGoogle();

    expect(tokens.access_token).toBe('ACCESS');
    expect(googleConfigureMock).toHaveBeenCalledWith({
      iosClientId: '222-ios.apps.googleusercontent.com',
      webClientId: '111-web.apps.googleusercontent.com',
    });
    expect(bffBodyOf(fetchSpy)).toEqual({
      id_token: 'google.id.token',
      provider: 'google',
      email: 'g@example.com',
    });
  });

  it('Google cancel (non-success response) → SocialCancelledError, no fetch', async () => {
    isSuccessResponseMock.mockReturnValue(false);
    googleSignInMock.mockResolvedValue({ type: 'cancelled', data: null } as Awaited<
      ReturnType<typeof GoogleSignin.signIn>
    >);

    await expect(signInWithGoogle()).rejects.toBeInstanceOf(SocialCancelledError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Google missing config → throws config error before any SDK call', async () => {
    delete process.env['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'];

    await expect(signInWithGoogle()).rejects.toThrow(/Google 설정 누락/);
    expect(googleSignInMock).not.toHaveBeenCalled();
  });

  // ── shared ───────────────────────────────────────────────────────────────

  it('propagates the BFF 409 collision as an ApiError', async () => {
    appleSignInMock.mockResolvedValue({
      identityToken: 'apple.id.token',
      email: 'dupe@example.com',
      fullName: null,
      user: 'apple-user-id',
      authorizationCode: null,
      realUserStatus: 1,
      state: null,
    } as Awaited<ReturnType<typeof AppleAuthentication.signInAsync>>);
    fetchSpy.mockResolvedValue(
      fakeBffResponse(
        { error: { code: 'ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER', message: 'exists' } },
        409,
      ),
    );

    await expect(signInWithApple()).rejects.toMatchObject({
      code: 'ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER',
      status: 409,
    });
    expect(await getAccessToken()).toBeNull();
  });

  it('signInWithSocial dispatches Apple vs Google', async () => {
    appleSignInMock.mockResolvedValue({
      identityToken: 'apple.id.token',
      email: 'apple@example.com',
      fullName: null,
      user: 'apple-user-id',
      authorizationCode: null,
      realUserStatus: 1,
      state: null,
    } as Awaited<ReturnType<typeof AppleAuthentication.signInAsync>>);

    await signInWithSocial('Apple');
    expect(appleSignInMock).toHaveBeenCalledTimes(1);
    expect(googleSignInMock).not.toHaveBeenCalled();
  });
});
