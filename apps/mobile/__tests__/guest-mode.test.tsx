// 게스트 모드 no-boot-kick 회귀 가드 (IMPL-MOBILE-GUEST-NEWS-HOME-001).
// 핵심 속성: 게스트(무토큰)가 News→ClaimDetail 경로를 봐도 protected endpoint 를
// 절대 호출하지 않고 signalLogout 이 발생하지 않는다(= Login 으로 안 튕긴다).
// 누군가 게스트 화면에 protected 호출을 추가하면 이 테스트가 적발한다.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null), // 무토큰 = 게스트
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ClaimDetailScreen } from '../src/screens/ClaimDetailScreen';
import { NewsScreen } from '../src/screens/NewsScreen';
import { GuestModeProvider } from '../src/lib/guest-mode';
import {
  __resetAuthEvents,
  onLoginRequiredSignal,
  onLogoutSignal,
} from '../src/lib/auth-events';
import { __resetPendingRefresh } from '../src/lib/fetch-with-refresh';
import { ThemeProvider } from '../src/ui';

const PROTECTED_PATTERNS = [/\/api\/subscriptions\//, /\/api\/meal-plans/, /\/api\/users\/me/];

const CLAIM = {
  id: '01927000-0000-7000-8000-000000000001',
  celebrity_id: '018d1a6a-0000-7000-8000-000000000040',
  claim_type: 'food' as const,
  headline: 'plant-based reset',
  body: null,
  trust_grade: 'B' as const,
  primary_source_url: null,
  verified_by: null,
  last_verified_at: null,
  is_health_claim: false,
  disclaimer_key: null,
  base_diet_id: '01927000-0000-7000-8000-00000000ba50', // non-null → 활성 CTA 경로
  tags: [],
  status: 'published' as const,
  published_at: '2026-04-15T00:00:00.000Z',
  is_active: true,
  created_at: '2026-04-15T00:00:00.000Z',
  updated_at: '2026-04-15T00:00:00.000Z',
};

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderGuest(ui: ReactElement): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <GuestModeProvider isGuest={true}>{ui}</GuestModeProvider>
    </ThemeProvider>,
  );
}

describe('guest mode — no boot-kick', () => {
  let fetchSpy: jest.SpyInstance;
  let logoutSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAuthEvents();
    __resetPendingRefresh();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    process.env['EXPO_PUBLIC_USER_SERVICE_URL'] = 'http://localhost:3001';
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (u.includes('/api/claims/feed')) {
        return Promise.resolve(makeResponse(200, { claims: [CLAIM], next_cursor: null, has_next: false }));
      }
      if (u.includes('/api/celebrities')) {
        return Promise.resolve(makeResponse(200, { items: [], next_cursor: null, has_next: false }));
      }
      if (/\/api\/claims\/[^/]+$/.test(u)) {
        return Promise.resolve(makeResponse(200, { claim: CLAIM, sources: [] }));
      }
      // 그 외(=protected)는 401 — 게스트가 호출하면 refresh→logout boot-kick 을 유발할 것.
      return Promise.resolve(makeResponse(401, { error: { code: 'UNAUTHORIZED', message: 'no token' } }));
    });
    logoutSpy = jest.fn();
    onLogoutSignal(logoutSpy);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    __resetAuthEvents();
  });

  function protectedCalls(): string[] {
    return (fetchSpy.mock.calls as Array<[string | URL | Request]>)
      .map(([u]) => (typeof u === 'string' ? u : u instanceof URL ? u.href : u.url))
      .filter((u) => PROTECTED_PATTERNS.some((p) => p.test(u)));
  }

  it('NewsScreen(guest): public 전용 fetch + signalLogout 미발생 + "Sign in" 노출', async () => {
    renderGuest(<NewsScreen onClaimPress={jest.fn()} />);

    expect(await screen.findByText('plant-based reset')).toBeTruthy();
    expect(screen.getByLabelText('Sign in')).toBeTruthy();
    expect(protectedCalls()).toEqual([]);
    expect(logoutSpy).not.toHaveBeenCalled();
  });

  it('ClaimDetailScreen(guest): credits fetch 안 함 + "Sign in to make your plan" CTA + sheet 미렌더 + signalLogout 미발생', async () => {
    const loginReqSpy = jest.fn();
    onLoginRequiredSignal(loginReqSpy);

    renderGuest(<ClaimDetailScreen claimId={CLAIM.id} onBack={jest.fn()} />);

    // 공개 getClaim 으로 상세는 로드되지만,
    await screen.findByText('plant-based reset');
    // 게스트 CTA = "Sign in to make your plan" (활성 CTA 아님).
    expect(screen.getByLabelText('Sign in to make your plan')).toBeTruthy();
    expect(screen.queryByLabelText('Eat like this celebrity')).toBeNull();
    // 핵심: protected(/api/meal-plans/credits 등) 0건 + logout 미발생 → boot-kick 없음.
    expect(protectedCalls()).toEqual([]);
    expect(logoutSpy).not.toHaveBeenCalled();
    // CTA 탭 → 로그인 게이트.
    fireEvent.press(screen.getByLabelText('Sign in to make your plan'));
    expect(loginReqSpy).toHaveBeenCalledTimes(1);
  });
});
