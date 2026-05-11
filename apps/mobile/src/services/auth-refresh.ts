// Refresh state machine — spec.md §9.3 Security "Refresh Token Reason Codes"
// 5종 enum 분기.
//
// 흐름:
//   1. SecureStore 에서 refresh_token 읽음
//   2. user-service `/auth/refresh` 직접 호출 (spec.md §4.2 예외 — BFF route 가
//      cookie-shaped 이라 mobile 은 user-service 우회 호출)
//   3. 200 응답 → 새 { access_token, refresh_token } 을 SecureStore 에 저장 + rotation
//   4. 401 응답의 envelope.error.code 5종 enum 분기:
//      - REFRESH_EXPIRED_OR_MISSING: 일반 만료, 사용자 재로그인 필요
//      - TOKEN_REUSE_DETECTED: 보안 사고 — 모든 디바이스 토큰 폐기 (BE 가 user-wide
//        revoke 수행, 본 클라이언트는 로컬 토큰만 비움)
//      - REFRESH_REVOKED: 명시적 revoke (예: 다른 디바이스 로그아웃)
//      - MALFORMED: refresh_token 형식 오류 — corruption 가능성, 로컬 폐기
//      - ACCOUNT_DELETED: 계정 삭제 — 로컬 폐기 + UI 안내

import type { schemas } from '@celebbase/shared-types';

import { ApiError, postJson } from '../lib/api-client';
import { clearTokens, getRefreshToken, setTokens } from '../lib/secure-store';

const USER_SERVICE_URL_ENV = 'EXPO_PUBLIC_USER_SERVICE_URL';

function getUserServiceUrl(): string {
  const raw: unknown = process.env[USER_SERVICE_URL_ENV];
  if (typeof raw !== 'string' || raw === '') {
    throw new Error(
      `[auth-refresh] Missing required env var: ${USER_SERVICE_URL_ENV}. ` +
        '로컬은 http://localhost:3001, prod 는 https://user.celebbase.com (또는 internal mesh URL).',
    );
  }
  return raw;
}

/**
 * Refresh state machine 의 외부 가시 결과.
 * Discriminated union — `status` 로 분기하여 UI / fetch wrapper 가 적절히 처리.
 */
export type RefreshResult =
  | { status: 'success'; tokens: schemas.AuthTokens }
  | { status: 'expired_or_missing' }
  | { status: 'reuse_detected' }
  | { status: 'revoked' }
  | { status: 'malformed' }
  | { status: 'account_deleted' };

/**
 * SecureStore 의 refresh_token 으로 user-service `/auth/refresh` 호출 + 응답 분기.
 *
 * 호출자 (fetch wrapper) 는 401 응답 시 본 함수를 호출하고 결과에 따라:
 *   - `success`: 원 요청 재시도
 *   - 그 외: `/login` 으로 라우팅 (`reuse_detected`, `account_deleted` 등은 별도 안내)
 *
 * @throws Error 네트워크 / JSON parse 에러 (ApiError 가 아닌 fetch 자체 실패)
 */
export async function refreshTokens(): Promise<RefreshResult> {
  const refreshToken = await getRefreshToken();
  if (refreshToken === null || refreshToken === '') {
    return { status: 'expired_or_missing' };
  }

  const body: schemas.RefreshRequest = { refresh_token: refreshToken };

  let tokens: schemas.RefreshResponse;
  try {
    tokens = await postJson<schemas.RefreshResponse>('/auth/refresh', body, {
      baseUrlOverride: getUserServiceUrl(),
    });
  } catch (err) {
    return mapErrorToResult(err);
  }

  if (tokens.access_token === '' || tokens.refresh_token === '') {
    return { status: 'malformed' };
  }

  await setTokens({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  return { status: 'success', tokens };
}

async function mapErrorToResult(err: unknown): Promise<RefreshResult> {
  if (!(err instanceof ApiError) || err.status !== 401) {
    // 네트워크 / 서버 5xx / 기타 — 호출자에게 throw 위임
    throw err;
  }

  switch (err.code) {
    case 'REFRESH_EXPIRED_OR_MISSING':
      return { status: 'expired_or_missing' };
    case 'TOKEN_REUSE_DETECTED':
      // 보안 사고 — BE 가 이미 user-wide revoke 수행. 로컬 토큰도 즉시 폐기.
      await clearTokens();
      return { status: 'reuse_detected' };
    case 'REFRESH_REVOKED':
      await clearTokens();
      return { status: 'revoked' };
    case 'MALFORMED':
      // refresh_token 자체 형식 오류 — 로컬 corruption 가능성
      await clearTokens();
      return { status: 'malformed' };
    case 'ACCOUNT_DELETED':
      await clearTokens();
      return { status: 'account_deleted' };
    default:
      // 미지정 code — 안전한 default (expired_or_missing) + 로컬 폐기
      // 새 enum 이 BE 에서 추가될 경우 클라이언트가 silent fail 안 하도록 폐기 유지.
      await clearTokens();
      return { status: 'expired_or_missing' };
  }
}
