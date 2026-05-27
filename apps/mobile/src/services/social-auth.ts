// Native social sign-in (Apple / Google) — IMPL-MOBILE-SOCIAL-NATIVE-001.
//
//   Apple  → expo-apple-authentication native sheet → identityToken
//   Google → @react-native-google-signin native picker → idToken
//        ↓
//   POST /api/auth/mobile/login { id_token, provider, email? }
//        ↓  (user-service verifies the token against the provider JWKS and
//            lazily provisions / looks the user up by the provider `sub`)
//   internal { access_token, refresh_token }
//        ↓
//   SecureStore + signalLogin('social')
//
// No Cognito federation, no Hosted UI, no Hub listener: each provider's token is
// verified DIRECTLY by user-service. This is what gives a real native sheet and
// removes the Cognito email-immutability bug.
//
// The native modules are imported statically here, but this file imports no
// aws-amplify barrel — so the buttons can import it without the heavy Amplify
// dependency. Under jest the two native modules are mocked globally
// (jest.setup.js); on device they are present in the dev build.

import * as AppleAuthentication from 'expo-apple-authentication';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import type { schemas } from '@celebbase/shared-types';

import { ApiError, postJson } from '../lib/api-client';
import { setTokens } from '../lib/secure-store';
import { signalLogin } from '../lib/auth-events';
import { AccountDeletedError } from '../lib/auth-errors';
import { readGoogleNativeConfig, type SocialProvider } from '../lib/social-config';

/**
 * Thrown when the user dismisses a native sheet / picker. The buttons map this
 * to "no message" — a cancellation is not an error.
 */
export class SocialCancelledError extends Error {
  constructor() {
    super('Social sign-in cancelled');
    this.name = 'SocialCancelledError';
  }
}

/**
 * Swap a verified provider id_token for our internal tokens at the BFF and
 * persist them. `email` is sent only when the provider supplied one — the
 * server treats the token's verified email claim as authoritative and resolves
 * the user by provider `sub` when none is present (native Apple re-sign-in).
 */
async function exchangeAndStore(
  idToken: string,
  provider: 'apple' | 'google',
  email: string | undefined,
  appleAuthorizationCode?: string,
): Promise<schemas.AuthTokens> {
  const body: schemas.LoginRequest = {
    id_token: idToken,
    provider,
    ...(email !== undefined && email !== '' ? { email } : {}),
    // Apple only — lets user-service exchange it for a refresh_token so account
    // deletion can revoke it at Apple (App Store 4.8.1).
    ...(appleAuthorizationCode !== undefined && appleAuthorizationCode !== ''
      ? { apple_authorization_code: appleAuthorizationCode }
      : {}),
  };
  // LoginResponse (not AuthTokens) so we can read the server-derived
  // `is_new_user` flag — true only when this login lazy-provisioned a brand-new
  // social account (IMPL-MOBILE-SOCIAL-SELECTION-001). Tokens are persisted the
  // same way; the `user` field on the wire is intentionally unused here.
  let res: schemas.LoginResponse;
  try {
    res = await postJson<schemas.LoginResponse>('/api/auth/mobile/login', body);
  } catch (err) {
    // IMPL-ACCOUNT-RESTORE-001: a soft-deleted social account 401s here. Re-throw
    // a typed error carrying the verified id_token + provider so the UI can offer
    // restore WITHOUT re-running the native picker.
    if (err instanceof ApiError && err.code === 'ACCOUNT_DELETED') {
      throw new AccountDeletedError(idToken, provider);
    }
    throw err;
  }
  if (res.access_token === '' || res.refresh_token === '') {
    throw new Error('[social-auth] BFF 응답에 빈 토큰 — 서버 측 계약 위반.');
  }
  await setTokens({
    access_token: res.access_token,
    refresh_token: res.refresh_token,
  });
  // 소셜 첫 로그인만 Selection 트리거 ('social_new'); 재로그인은 'social'.
  // is_new_user 부재(rolling deploy 중 구 BE)는 undefined → 'social' (스푸리어스 방지).
  signalLogin(res.is_new_user === true ? 'social_new' : 'social');
  return res;
}

/** ERR_REQUEST_CANCELED is thrown by expo-apple-authentication on dismissal. */
function isAppleCancel(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: unknown }).code === 'ERR_REQUEST_CANCELED'
  );
}

/**
 * Native Sign in with Apple. iOS only.
 *
 * @throws SocialCancelledError user dismissed the sheet
 * @throws ApiError BFF error envelope (e.g. 409 collision)
 * @throws Error missing identityToken / empty tokens
 */
export async function signInWithApple(): Promise<schemas.AuthTokens> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err) {
    if (isAppleCancel(err)) throw new SocialCancelledError();
    throw err;
  }

  const idToken = credential.identityToken;
  if (idToken === null || idToken === '') {
    throw new Error(
      '[social-auth] Apple identityToken 부재 — Sign in with Apple capability 확인.',
    );
  }
  // Apple returns `email` only on the FIRST authorization; on re-sign-in it is
  // null and user-service resolves the user by the token `sub`.
  const email = credential.email ?? undefined;
  // authorizationCode (one-time) lets user-service capture an Apple refresh_token
  // for later revocation on account deletion. null is tolerated (revoke off).
  const authorizationCode = credential.authorizationCode ?? undefined;
  return exchangeAndStore(idToken, 'apple', email, authorizationCode);
}

/**
 * Native Google sign-in (full-screen account picker).
 *
 * @throws SocialCancelledError user dismissed the picker
 * @throws ApiError BFF error envelope (e.g. 409 collision)
 * @throws Error missing config / missing idToken / empty tokens
 */
export async function signInWithGoogle(): Promise<schemas.AuthTokens> {
  const cfg = readGoogleNativeConfig();
  if (cfg === undefined) {
    throw new Error(
      '[social-auth] Google 설정 누락 — EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID 확인.',
    );
  }

  // Idempotent — re-configuring on each call is cheap and avoids a module-init
  // ordering dependency. webClientId becomes the idToken `aud` that
  // user-service verifies against GOOGLE_CLIENT_IDS.
  GoogleSignin.configure({
    iosClientId: cfg.iosClientId,
    webClientId: cfg.webClientId,
  });

  let response: Awaited<ReturnType<typeof GoogleSignin.signIn>>;
  try {
    await GoogleSignin.hasPlayServices();
    response = await GoogleSignin.signIn();
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new SocialCancelledError();
    }
    throw err;
  }

  if (!isSuccessResponse(response)) {
    // type === 'cancelled'
    throw new SocialCancelledError();
  }

  const idToken = response.data.idToken;
  if (idToken === null || idToken === '') {
    throw new Error('[social-auth] Google idToken 부재 — webClientId 설정 확인.');
  }
  return exchangeAndStore(idToken, 'google', response.data.user.email);
}

/**
 * Dispatch to the native flow for `provider`. Mirrors `services/auth.ts` signIn
 * so screens treat it identically (await → onSuccess, catch → message).
 */
export async function signInWithSocial(provider: SocialProvider): Promise<schemas.AuthTokens> {
  return provider === 'Apple' ? signInWithApple() : signInWithGoogle();
}
