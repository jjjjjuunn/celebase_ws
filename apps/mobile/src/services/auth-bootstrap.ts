// Cold start 시 SecureStore 토큰 존재로 화면 분기.
//
// 검증 fetch 호출은 하지 않는다 (낙관적). 이유:
//   - 첫 protected API 호출이 401 이면 fetch wrapper 가 자동으로 refresh →
//     성공 시 silent 복구, 실패 시 logout 신호 → LoginScreen 으로 복귀.
//   - cold start 마다 검증 호출을 추가하면 콜드 부팅 latency 가 길어진다.
//
// 두 토큰 모두 존재해야 'authenticated' — refresh_token 만 있고 access_token
// 이 없는 상태는 비정상 (clearTokens 가 atomic 이 아닐 때 발생) → 'login' 으로
// 처리.

import { getAccessToken, getRefreshToken } from '../lib/secure-store';

export type BootstrapResult = 'authenticated' | 'login';

/**
 * App.tsx 의 첫 useEffect 에서 호출. SecureStore 의 두 토큰 존재 여부로 분기.
 *
 * @returns 'authenticated' = 토큰 둘 다 존재 / 'login' = 하나라도 부재
 */
export async function bootstrapSession(): Promise<BootstrapResult> {
  const [accessToken, refreshToken] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
  ]);

  if (accessToken === null || accessToken === '') return 'login';
  if (refreshToken === null || refreshToken === '') return 'login';

  return 'authenticated';
}
