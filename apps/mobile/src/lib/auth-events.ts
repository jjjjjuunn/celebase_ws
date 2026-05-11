// 인증 이벤트 publish/subscribe — fetch wrapper 가 refresh 실패 (5-enum) 를
// 감지했을 때 App 의 navigation 레이어로 logout 신호를 보내는 가벼운 채널.
//
// React Context 보다 가벼운 module-level singleton — fetch wrapper 는 hook
// 밖에서도 호출되므로 (예: 이벤트 핸들러, useEffect 콜백, services/ 함수)
// React tree 와 독립적인 채널이 필요하다.
//
// 사용:
//   App.tsx 에서 mount 시 `const off = onLogoutSignal((reason) => ...); return off;`
//   fetch wrapper 에서 `signalLogout('reuse_detected')`

import type { RefreshResult } from '../services/auth-refresh';

/**
 * Logout 사유 — `RefreshResult['status']` 에서 `'success'` 를 제외한 5종.
 * spec.md §9.3 의 Refresh Token Reason Codes 5종과 1:1 대응.
 */
export type LogoutReason = Exclude<RefreshResult['status'], 'success'>;

type Handler = (reason: LogoutReason) => void;

const handlers = new Set<Handler>();

/**
 * Logout 신호를 구독한다. 반환된 함수를 호출해 구독 해제 (useEffect cleanup).
 */
export function onLogoutSignal(handler: Handler): () => void {
  handlers.add(handler);
  return (): void => {
    handlers.delete(handler);
  };
}

/**
 * 모든 구독자에게 logout 신호를 즉시 동기로 전달한다.
 * 핸들러가 throw 해도 다른 핸들러 실행을 막지 않는다.
 */
export function signalLogout(reason: LogoutReason): void {
  for (const handler of handlers) {
    try {
      handler(reason);
    } catch {
      // 핸들러 에러는 격리 — 다른 구독자에게 영향 X. silent 처리.
    }
  }
}

/**
 * 테스트 전용 — 등록된 모든 handler 를 제거한다.
 */
export function __resetAuthEvents(): void {
  handlers.clear();
}
