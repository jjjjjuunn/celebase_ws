// Cold start 시 SecureStore 토큰 존재로 화면 분기.
//
// 검증 fetch 호출은 하지 않는다 (낙관적). 이유:
//   - 첫 protected API 호출이 401 이면 fetch wrapper 가 자동으로 refresh →
//     성공 시 silent 복구, 실패 시 logout 신호 → LoginScreen 으로 복귀.
//   - cold start 마다 검증 호출을 추가하면 콜드 부팅 latency 가 길어진다.
//
// 두 토큰 모두 존재해야 'authenticated' — refresh_token 만 있고 access_token
// 이 없는 상태는 비정상 (clearTokens 가 atomic 이 아닐 때 발생) → 'guest' 로
// 처리.
//
// 'guest' (IMPL-MOBILE-GUEST-NEWS-HOME-001): 무토큰이면 로그인 화면이 아니라
// 게스트 진입(News 트렌드 카드뉴스 홈). 로그인은 게이트 액션("Make my Plan") 에서만.

import { clearTokens, getAccessToken, getRefreshToken } from '../lib/secure-store';

export type BootstrapResult = 'authenticated' | 'guest';

/**
 * App.tsx 의 첫 useEffect 에서 호출. SecureStore 의 두 토큰 존재 여부로 분기.
 *
 * @returns 'authenticated' = 토큰 둘 다 존재 / 'guest' = 하나라도 부재(게스트 브라우징)
 */
export async function bootstrapSession(): Promise<BootstrapResult> {
  // DEV-ONLY escape hatch: EXPO_PUBLIC_DEV_SKIP_AUTH=1 → 로그인 우회 후 메인 진입.
  // BE 호출은 실패하지만 화면 layout 점검은 가능.
  if (__DEV__ && process.env['EXPO_PUBLIC_DEV_SKIP_AUTH'] === '1') {
    return 'authenticated';
  }

  const [accessToken, refreshToken] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
  ]);

  const hasAccess = accessToken !== null && accessToken !== '';
  const hasRefresh = refreshToken !== null && refreshToken !== '';

  if (hasAccess && hasRefresh) return 'authenticated';

  // 게스트 진입. 부분 토큰(비정상 — clearTokens 가 atomic 이 아닐 때)이 남아있으면 정리한다:
  // authedFetch 는 access token 이 있으면 public 요청에도 Bearer 를 붙이므로, stale token 을
  // 두면 게스트의 public fetch 가 401→refresh(불가)→logout boot-kick 을 유발할 수 있다.
  // 게스트는 "진짜 무토큰" 이어야 한다(no-boot-kick 보장). (Codex L3 hypothesis 반영.)
  if (hasAccess || hasRefresh) await clearTokens();
  return 'guest';
}
