// Mobile auth flow — spec.md §4.2 mobile ingress (Option B BFF mobile route).
//
//   user 입력 (email, password)
//        ↓
//   Cognito SRP (Amplify v6) — 비밀번호는 SRP 프로토콜로 송신, 평문 X
//        ↓
//   id_token (Cognito JWT)
//        ↓
//   BFF POST /api/auth/mobile/login { email, id_token }
//        ↓
//   internal { access_token, refresh_token } 응답
//        ↓
//   SecureStore (iOS Keychain / Android Keystore) 저장
//
// 본 sub-task (M1-C) 의 책임: signIn / signOut 흐름. signUp / 이메일 confirmation
// 은 M1-E UI 단계에서 별도 함수로 추가 (Cognito 의 confirmation 흐름이 UI
// 와 강결합 — 코드 입력 화면 필요).

import { fetchAuthSession, signIn as amplifySignIn, signOut as amplifySignOut } from 'aws-amplify/auth';
import type { schemas } from '@celebbase/shared-types';

import { postJson } from '../lib/api-client';
import { clearTokens, setTokens } from '../lib/secure-store';

/**
 * 기존 사용자 로그인. 성공 시 SecureStore 에 access/refresh 저장.
 *
 * @throws Error Cognito SRP 실패 (비밀번호 오류, 사용자 미존재, MFA 미지원 단계 등)
 * @throws ApiError BFF /api/auth/mobile/login 가 4xx/5xx 응답 시 (`error.code` 로 분기 가능)
 */
export async function signIn(params: { email: string; password: string }): Promise<schemas.AuthTokens> {
  const { email, password } = params;

  const result = await amplifySignIn({ username: email, password });
  if (!result.isSignedIn) {
    // MFA / NEW_PASSWORD_REQUIRED 같은 추가 단계 — M1-E UI 에서 별도 처리.
    throw new Error(
      `[auth] signIn requires additional step: ${result.nextStep.signInStep}. UI 흐름에서 처리 필요.`,
    );
  }

  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (idToken === undefined || idToken === '') {
    throw new Error('[auth] Cognito session 에 idToken 미존재 — Amplify 초기화 또는 user pool 설정 확인.');
  }

  const body: schemas.LoginRequest = { email, id_token: idToken };
  const tokens = await postJson<schemas.AuthTokens>('/api/auth/mobile/login', body);

  if (tokens.access_token === '' || tokens.refresh_token === '') {
    throw new Error('[auth] BFF 응답에 빈 토큰 — 서버 측 계약 위반.');
  }

  await setTokens({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  return tokens;
}

/**
 * 로그아웃. SecureStore 토큰 제거 + Cognito 세션 종료.
 * SecureStore 먼저 — Amplify signOut 이 네트워크 실패해도 로컬 토큰은 확실히 폐기.
 */
export async function signOut(): Promise<void> {
  await clearTokens();
  try {
    await amplifySignOut();
  } catch (err) {
    // Amplify signOut 은 best-effort. 로컬 SecureStore 가 이미 비워졌으므로
    // 다음 API 호출은 모두 401 → refresh state machine 이 정리. 본 catch 는
    // unhandled rejection 방지용.
    if (process.env['NODE_ENV'] !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[auth] amplifySignOut failed (ignored — local tokens already cleared):', err);
    }
  }
}
