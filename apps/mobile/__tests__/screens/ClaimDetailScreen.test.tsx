jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// CTA wiring (IMPL-MOBILE-CLAIM-CTA-001) introduces useMealPlanCredits, which
// fires its own fetch on every mount — stub it so each test's mockResolvedValueOnce
// still covers only the /claims/:id fetch. 잔량은 per-test 로 조정(무크레딧→Paywall 검증).
let mockCreditsRemaining = 3; // jest factory 가 참조하려면 'mock' prefix 필수.
jest.mock('../../src/lib/use-meal-plan-credits', () => ({
  useMealPlanCredits: () => ({
    credits: { credits_remaining: mockCreditsRemaining, credits_total: 3, tier: 'premium' },
    loading: false,
    refresh: jest.fn(),
  }),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ClaimDetailScreen } from '../../src/screens/ClaimDetailScreen';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';
import { ThemeProvider } from '../../src/ui';

// Screen renders ui primitives (useTheme) — wrap every render in ThemeProvider.
function renderScreen(ui: ReactElement): ReturnType<typeof render> {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const CLAIM_BASE = {
  id: '01927000-0000-7000-8000-000000000001',
  celebrity_id: '018d1a6a-0000-7000-8000-000000000040',
  claim_type: 'food' as const,
  headline: 'celery juice ritual',
  body: 'morning routine since 2019',
  trust_grade: 'B' as const,
  primary_source_url: null,
  verified_by: null,
  last_verified_at: null,
  is_health_claim: false,
  disclaimer_key: null,
  base_diet_id: null,
  tags: [],
  status: 'published' as const,
  published_at: '2026-04-15T00:00:00.000Z',
  is_active: true,
  created_at: '2026-04-15T00:00:00.000Z',
  updated_at: '2026-04-15T00:00:00.000Z',
  story: null,
};

const SOURCE_BASE = {
  id: '01927000-0000-7000-8000-000000000099',
  claim_id: CLAIM_BASE.id,
  source_type: 'article' as const,
  outlet: 'Vogue',
  url: 'https://vogue.com/celery-article',
  published_date: '2024-03-15',
  excerpt: null,
  is_primary: true,
  created_at: '2026-04-15T00:00:00.000Z',
};

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('<ClaimDetailScreen />', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPendingRefresh();
    mockCreditsRemaining = 3; // 기본: 크레딧 보유(기존 테스트는 enabled CTA 전제).
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    process.env['EXPO_PUBLIC_USER_SERVICE_URL'] = 'http://localhost:3001';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('mount → getClaim 호출 후 headline / body / 출처 노출', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { claim: CLAIM_BASE, sources: [SOURCE_BASE] }),
    );

    renderScreen(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);

    expect(await screen.findByText('celery juice ritual')).toBeTruthy();
    expect(screen.getByText('morning routine since 2019')).toBeTruthy();
    expect(screen.getByText('Vogue (2024)')).toBeTruthy();
  });

  it('disclaimer 조건: trust_grade D → 노출', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, {
        claim: { ...CLAIM_BASE, trust_grade: 'D' as const },
        sources: [],
      }),
    );

    renderScreen(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    expect(
      screen.getByText(/educational purposes only/i),
    ).toBeTruthy();
  });

  it('disclaimer 조건: is_health_claim=true → 노출', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, {
        claim: { ...CLAIM_BASE, is_health_claim: true },
        sources: [],
      }),
    );

    renderScreen(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    expect(
      screen.getByText(/educational purposes only/i),
    ).toBeTruthy();
  });

  it('trust_grade B + is_health_claim false → disclaimer 미노출', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { claim: CLAIM_BASE, sources: [] }),
    );

    renderScreen(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    expect(screen.queryByText(/educational purposes only/i)).toBeNull();
  });

  it('"이 셀럽처럼 먹어보기" 버튼: base_diet_id 있을 때 노출 (active CTA)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, {
        claim: { ...CLAIM_BASE, base_diet_id: '01927000-0000-7000-8000-aaaaaaaaaaaa' },
        sources: [],
      }),
    );

    renderScreen(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    // IMPL-MOBILE-CLAIM-CTA-001: "Coming soon" 정적 텍스트는 active CTA 로 교체됨.
    // CTA 라벨은 "Make my Plan" 으로 통일(IMPL-MOBILE-CLAIM-STORY-SCHEMA-001).
    expect(screen.getByLabelText('Make my Plan')).toBeTruthy();
    expect(screen.queryByText('Coming soon')).toBeNull();
  });

  it('food + base_diet_id null → CTA 미노출 + "준비 중" 노출', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { claim: CLAIM_BASE, sources: [] }),
    );

    renderScreen(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    expect(screen.queryByText('Make my Plan')).toBeNull();
    expect(screen.getByText('Personalized plan — coming soon')).toBeTruthy();
  });

  it('비-food claim(beauty) → base_diet_id 있어도 CTA·"준비 중" 둘 다 미노출 (food 게이트)', async () => {
    // base_diet_id 를 일부러 non-null 로 둬도 비-food 는 게이트에서 차단됨을 증명(vacuous 아님).
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, {
        claim: {
          ...CLAIM_BASE,
          claim_type: 'beauty' as const,
          base_diet_id: '01927000-0000-7000-8000-bbbbbbbbbbbb',
        },
        sources: [],
      }),
    );

    renderScreen(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    expect(screen.queryByText('Make my Plan')).toBeNull();
    expect(screen.queryByText('Personalized plan — coming soon')).toBeNull();
  });

  it('source.url 이 allowlist 외 → "Source link unavailable" 표기 + Link role 미부착', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, {
        claim: CLAIM_BASE,
        sources: [{ ...SOURCE_BASE, url: 'https://malicious.com/x' }],
      }),
    );

    renderScreen(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    expect(screen.getByText('Source link unavailable')).toBeTruthy();
    // 외부 링크 열기 가능한 TouchableOpacity 없어야 한다.
    expect(screen.queryByLabelText('Open Vogue link')).toBeNull();
  });

  it('← Back 버튼 → onBack 콜백', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { claim: CLAIM_BASE, sources: [] }),
    );
    const onBack = jest.fn();

    renderScreen(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={onBack} />);
    await screen.findByText('celery juice ritual');

    fireEvent.press(screen.getByLabelText('Back'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('잔량>0 → "Make my Plan" 탭 → 생성 시트(컴팩트) 오픈', async () => {
    // claim + 시트의 getBaseDiet 가 같은 fetch 를 타므로 mockResolvedValue(persistent) 사용.
    // getBaseDiet 는 claim shape 를 받아 parse 실패→맥락만 생략(시트는 정상 렌더).
    fetchSpy.mockResolvedValue(
      makeResponse(200, {
        claim: { ...CLAIM_BASE, base_diet_id: '01927000-0000-7000-8000-aaaaaaaaaaaa' },
        sources: [],
      }),
    );

    renderScreen(
      <ClaimDetailScreen
        claimId={CLAIM_BASE.id}
        onBack={jest.fn()}
        onPlanCreated={jest.fn()}
        onNavigatePaywall={jest.fn()}
      />,
    );

    fireEvent.press(await screen.findByLabelText('Make my Plan'));
    // 시트가 열리면 컴팩트 시트의 생성 버튼이 나타난다.
    expect(await screen.findByLabelText('Generate plan')).toBeTruthy();
  });

  it('무크레딧(잔량 0) → "Make my Plan" 탭 → Paywall (dead-end Alert 없음)', async () => {
    mockCreditsRemaining = 0;
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, {
        claim: { ...CLAIM_BASE, base_diet_id: '01927000-0000-7000-8000-aaaaaaaaaaaa' },
        sources: [],
      }),
    );
    const onNavigatePaywall = jest.fn();

    renderScreen(
      <ClaimDetailScreen
        claimId={CLAIM_BASE.id}
        onBack={jest.fn()}
        onNavigatePaywall={onNavigatePaywall}
      />,
    );
    await screen.findByText('celery juice ritual');

    // ctaDisabled(잔량 0): 시트가 아니라 Paywall 로 이동(dead-end 제거).
    fireEvent.press(screen.getByLabelText('Make my Plan'));
    expect(onNavigatePaywall).toHaveBeenCalledTimes(1);
  });
});
