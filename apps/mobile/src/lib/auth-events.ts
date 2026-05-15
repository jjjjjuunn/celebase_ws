// 인증 이벤트 publish/subscribe — auth 흐름 (login/logout) 을 navigation 레이어로
// 전달하는 가벼운 채널.
//
// React Context 보다 가벼운 module-level singleton — auth/fetch 코드는 hook
// 밖에서도 호출되므로 (예: 이벤트 핸들러, useEffect 콜백, services/ 함수)
// React tree 와 독립적인 채널이 필요하다.
//
// 사용:
//   App.tsx 에서 mount 시:
//     const offIn = onLoginSignal((reason) => setPhase('main')); return offIn;
//     const offOut = onLogoutSignal((reason) => setPhase('auth')); return offOut;
//   services/auth 에서 `signalLogin('manual')` (signIn 성공 후)
//   fetch wrapper 에서 `signalLogout('reuse_detected')`

import type { RefreshResult } from '../services/auth-refresh';

/**
 * Logout 사유 — `RefreshResult['status']` 에서 `'success'` 를 제외한 5종.
 * spec.md §9.3 의 Refresh Token Reason Codes 5종과 1:1 대응.
 */
export type LogoutReason = Exclude<RefreshResult['status'], 'success'>;

/**
 * Login 신호 사유 — RootNavigator 의 phase='main' 전환 trigger.
 *
 * - 'manual': LoginScreen 의 SRP signIn 성공
 * - 'signup': SignupScreen 의 confirmSignUp 후 자동 signIn 성공
 *
 * bootstrapSession 경로는 setPhase 직접 호출 (App mount 단계라 signal 불필요).
 */
export type LoginReason = 'manual' | 'signup';

type LogoutHandler = (reason: LogoutReason) => void;
type LoginHandler = (reason: LoginReason) => void;

const logoutHandlers = new Set<LogoutHandler>();
const loginHandlers = new Set<LoginHandler>();

/**
 * Logout 신호를 구독한다. 반환된 함수를 호출해 구독 해제 (useEffect cleanup).
 */
export function onLogoutSignal(handler: LogoutHandler): () => void {
  logoutHandlers.add(handler);
  return (): void => {
    logoutHandlers.delete(handler);
  };
}

/**
 * 모든 구독자에게 logout 신호를 즉시 동기로 전달한다.
 * 핸들러가 throw 해도 다른 핸들러 실행을 막지 않는다.
 */
export function signalLogout(reason: LogoutReason): void {
  for (const handler of logoutHandlers) {
    try {
      handler(reason);
    } catch {
      // 핸들러 에러는 격리 — 다른 구독자에게 영향 X. silent 처리.
    }
  }
}

/**
 * Login 신호를 구독한다. 반환된 함수를 호출해 구독 해제 (useEffect cleanup).
 * onLogoutSignal 과 거울 구조.
 */
export function onLoginSignal(handler: LoginHandler): () => void {
  loginHandlers.add(handler);
  return (): void => {
    loginHandlers.delete(handler);
  };
}

/**
 * 모든 구독자에게 login 신호를 즉시 동기로 전달한다.
 * 핸들러가 throw 해도 다른 핸들러 실행을 막지 않는다.
 * signalLogout 과 거울 구조.
 */
export function signalLogin(reason: LoginReason): void {
  for (const handler of loginHandlers) {
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
  logoutHandlers.clear();
  loginHandlers.clear();
}
