// 게스트 모드 여부만 전달하는 minimal context (풀 AuthContext 아님 — 의도적).
// RootNavigator 가 phase==='guest' 를 provide; 화면은 useIsGuest() 로 소비해
// 게스트-specific UI(Sign in 어포던스, CTA 게이트, protected hook skip)를 분기한다.
// IMPL-MOBILE-GUEST-NEWS-HOME-001.

import { createContext, useContext, type ReactNode } from 'react';

const GuestModeContext = createContext<boolean>(false);

export function GuestModeProvider({
  isGuest,
  children,
}: {
  isGuest: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return <GuestModeContext.Provider value={isGuest}>{children}</GuestModeContext.Provider>;
}

/** 현재 게스트(무토큰 브라우징) 모드 여부. Provider 밖이면 false(authed) 기본. */
export function useIsGuest(): boolean {
  return useContext(GuestModeContext);
}
