// Hosted-UI social login (Google / Apple) — IMPL-MOBILE-SOCIAL-001.
//
//   user taps "Continue with Google/Apple"
//        ↓
//   signInWithRedirect({ provider })  — opens Cognito Hosted UI in
//        ASWebAuthenticationSession (iOS) / Chrome Custom Tabs (Android) via
//        the @aws-amplify/rtn-web-browser native module
//        ↓
//   provider auth → redirect back to celebbase://callback/
//        ↓
//   Amplify exchanges the auth code for Cognito tokens, then emits the
//   'signInWithRedirect' event on the Hub 'auth' channel
//        ↓
//   we read the id_token, exchange it at BFF /api/auth/mobile/login for our
//   internal { access_token, refresh_token } (same path as SRP signIn)
//        ↓
//   SecureStore + signalLogin('social')
//
// Why a one-shot Hub listener: signInWithRedirect()'s promise resolves when the
// browser session is *opened*, not when sign-in completes — completion arrives
// asynchronously on the Hub. We register the listener BEFORE calling
// signInWithRedirect (so the event can't be missed), await it, and ALWAYS clean
// up (finally) with a 3-minute timeout so a cancelled/stalled flow can never
// leak a listener into the next attempt (advisor review, IMPL-MOBILE-SOCIAL-001).

import {
  fetchAuthSession,
  signInWithRedirect,
  signOut as amplifySignOut,
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import type { schemas } from '@celebbase/shared-types';

import { postJson } from '../lib/api-client';
import { setTokens } from '../lib/secure-store';
import { signalLogin } from '../lib/auth-events';
import type { SocialProvider } from '../lib/social-config';

/** Upper bound on a single Hosted-UI round trip before we give up and clean up. */
const REDIRECT_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * After the Hub signals redirect completion: pull the verified id_token, swap it
 * for our internal tokens at the BFF, and persist them. On ANY failure (e.g. the
 * BFF returns 409 ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER) we best-effort sign the
 * Cognito session out, so a retry starts clean rather than tripping over a
 * lingering UserAlreadyAuthenticated state.
 *
 * @throws ApiError BFF error envelope (e.g. 409 collision)
 * @throws Error    missing id_token / missing email claim / empty tokens
 */
async function completeSocialExchange(): Promise<schemas.AuthTokens> {
  try {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    if (idToken === undefined || idToken === '') {
      throw new Error('[social-auth] Cognito session 에 idToken 미존재 — Hosted UI 설정 확인.');
    }

    // user-service trusts the email claim inside the verified id_token (not the
    // body), but LoginRequestSchema still requires `email` on the wire — take it
    // from the same verified token to avoid drift.
    const claims = session.tokens?.idToken?.payload;
    const emailClaim = claims?.['email'];
    const email = typeof emailClaim === 'string' ? emailClaim : '';
    if (email === '') {
      throw new Error('[social-auth] id_token 에 email claim 부재 — provider 의 email scope 확인.');
    }

    const body: schemas.LoginRequest = { email, id_token: idToken };
    const tokens = await postJson<schemas.AuthTokens>('/api/auth/mobile/login', body);

    if (tokens.access_token === '' || tokens.refresh_token === '') {
      throw new Error('[social-auth] BFF 응답에 빈 토큰 — 서버 측 계약 위반.');
    }

    await setTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    signalLogin('social');
    return tokens;
  } catch (err) {
    try {
      await amplifySignOut();
    } catch {
      // best-effort — local exchange failure already surfaces to the caller.
    }
    throw err;
  }
}

/**
 * Run the full Hosted-UI social sign-in for `provider` and resolve with the
 * stored internal tokens. Mirrors `services/auth.ts` signIn so screens treat it
 * identically (await → onSuccess, catch → message).
 *
 * @throws ApiError BFF error envelope (notably 409 ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER)
 * @throws Error    user cancel / redirect failure / id_token issues / 3-min timeout
 */
export async function signInWithSocial(provider: SocialProvider): Promise<schemas.AuthTokens> {
  let stop: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const completion = new Promise<schemas.AuthTokens>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error('[social-auth] 로그인 시간이 초과되었습니다. 다시 시도해 주세요.'));
    }, REDIRECT_TIMEOUT_MS);

    // Registered synchronously, before signInWithRedirect → the completion
    // event can never race ahead of the listener.
    stop = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect') {
        completeSocialExchange().then(resolve, reject);
      } else if (payload.event === 'signInWithRedirect_failure') {
        reject(new Error('[social-auth] 소셜 로그인에 실패했습니다. 다시 시도해 주세요.'));
      }
    });
  });

  try {
    await signInWithRedirect({ provider });
    return await completion;
  } finally {
    // ALL paths (success, BFF error, user cancel rejecting signInWithRedirect,
    // timeout) converge here — no listener or timer survives the call.
    if (timer !== undefined) clearTimeout(timer);
    if (stop !== undefined) stop();
  }
}
