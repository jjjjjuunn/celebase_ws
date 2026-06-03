jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { NewsScreen } from '../../src/screens/NewsScreen';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';
import { ThemeProvider } from '../../src/ui';

// Screen renders ui primitives (useTheme) — wrap every render in ThemeProvider.
function renderScreen(ui: ReactElement): ReturnType<typeof render> {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const BEYONCE_ID = '01927000-0000-7000-8000-0000000000b1';
const ROCK_ID = '01927000-0000-7000-8000-0000000000a2';

type ClaimOverrides = {
  id: string;
  celebrity_id: string | null;
  claim_type: 'food' | 'workout' | 'sleep' | 'beauty' | 'brand' | 'philosophy' | 'supplement';
  headline: string;
};

function makeClaim(o: ClaimOverrides): Record<string, unknown> {
  return {
    id: o.id,
    celebrity_id: o.celebrity_id,
    claim_type: o.claim_type,
    headline: o.headline,
    body: null,
    trust_grade: 'B',
    primary_source_url: null,
    verified_by: null,
    last_verified_at: null,
    is_health_claim: false,
    disclaimer_key: null,
    base_diet_id: null,
    tags: [],
    status: 'published',
    published_at: '2026-04-15T00:00:00.000Z',
    is_active: true,
    created_at: '2026-04-15T00:00:00.000Z',
    updated_at: '2026-04-15T00:00:00.000Z',
  };
}

function makeCeleb(id: string, displayName: string): Record<string, unknown> {
  return {
    id,
    slug: displayName.toLowerCase().replace(/\s+/g, '-'),
    display_name: displayName,
    short_bio: null,
    avatar_url: 'https://example.test/avatar.jpg',
    cover_image_url: null,
    category: 'diet',
    tags: [],
    is_featured: false,
    sort_order: 0,
    is_active: true,
    created_at: '2026-04-15T00:00:00.000Z',
    updated_at: '2026-04-15T00:00:00.000Z',
  };
}

// food→diet, beauty→beauty, workout→wellness, brand→excluded.
const FOOD_CLAIM = makeClaim({
  id: '01927000-0000-7000-8000-000000000001',
  celebrity_id: BEYONCE_ID,
  claim_type: 'food',
  headline: 'plant-based reset',
});
const BEAUTY_CLAIM = makeClaim({
  id: '01927000-0000-7000-8000-000000000002',
  celebrity_id: BEYONCE_ID,
  claim_type: 'beauty',
  headline: 'collagen morning routine',
});
const WORKOUT_CLAIM = makeClaim({
  id: '01927000-0000-7000-8000-000000000003',
  celebrity_id: ROCK_ID,
  claim_type: 'workout',
  headline: 'the iron paradise split',
});
const BRAND_CLAIM = makeClaim({
  id: '01927000-0000-7000-8000-000000000004',
  celebrity_id: ROCK_ID,
  claim_type: 'brand',
  headline: 'project rock protein launch',
});

const ALL_CLAIMS = [FOOD_CLAIM, BEAUTY_CLAIM, WORKOUT_CLAIM, BRAND_CLAIM];
const ALL_CELEBS = [makeCeleb(BEYONCE_ID, 'Beyoncé'), makeCeleb(ROCK_ID, 'The Rock')];

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** fetch mock router — claims feed + celebrities 두 endpoint 라우팅. */
function mockFetchRouter(
  fetchSpy: jest.SpyInstance,
  opts: { claims?: Response; celebs?: Response } = {},
): void {
  fetchSpy.mockImplementation((url: string | URL | Request) => {
    const urlStr =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (urlStr.includes('/api/claims/feed')) {
      return Promise.resolve(
        opts.claims ??
          makeResponse(200, { claims: ALL_CLAIMS, next_cursor: null, has_next: false }),
      );
    }
    if (urlStr.includes('/api/celebrities')) {
      return Promise.resolve(
        opts.celebs ??
          makeResponse(200, { items: ALL_CELEBS, next_cursor: null, has_next: false }),
      );
    }
    return Promise.resolve(makeResponse(200, {}));
  });
}

describe('<NewsScreen />', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPendingRefresh();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    process.env['EXPO_PUBLIC_USER_SERVICE_URL'] = 'http://localhost:3001';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('기본 Diet 탭 → food claim + 셀럽 이름 렌더, 타 카테고리 미렌더', async () => {
    mockFetchRouter(fetchSpy);

    renderScreen(<NewsScreen onClaimPress={jest.fn()} />);

    expect(await screen.findByText('plant-based reset')).toBeTruthy();
    // 셀럽 attribution (client-side join) — 이름이 카드 accessibilityLabel 로 announce 되고
    // (a11y 계약: 앵커 행은 a11y 트리에서 숨겨 중복 focus 방지), 시각적으로도 앵커 행에 렌더.
    expect(screen.getByLabelText('Beyoncé: plant-based reset')).toBeTruthy();
    // cover 카드 디자인(IMPL-MOBILE-NEWS-COVER-001): 셀럽명은 표지 eyebrow 에 대문자로
    // 렌더된다("DIET · BEYONCÉ"). 위 a11y 라벨이 "Beyoncé: …" attribution 을 announce.
    expect(screen.getByText(/Beyoncé/i, { includeHiddenElements: true })).toBeTruthy();
    // beauty/workout/brand claim 은 Diet 탭에서 미렌더.
    expect(screen.queryByText('collagen morning routine')).toBeNull();
    expect(screen.queryByText('the iron paradise split')).toBeNull();
    expect(screen.queryByText('project rock protein launch')).toBeNull();
  });

  it('셀럽 없는 트렌드 카드(celebrity_id null) → 셀럽 attribution 없이 렌더', async () => {
    const celebLessFood = makeClaim({
      id: '01927000-0000-7000-8000-0000000000f1',
      celebrity_id: null,
      claim_type: 'food',
      headline: 'fibermaxxing explained',
    });
    mockFetchRouter(fetchSpy, {
      claims: makeResponse(200, { claims: [celebLessFood], next_cursor: null, has_next: false }),
    });

    renderScreen(<NewsScreen onClaimPress={jest.fn()} />);

    // 카드는 렌더되고(Diet 탭) — 셀럽 prefix 없는 fallback label.
    expect(await screen.findByText('fibermaxxing explained')).toBeTruthy();
    expect(screen.getByLabelText('claim fibermaxxing explained')).toBeTruthy();
    // 셀럽 attribution 행 미렌더.
    expect(screen.queryByText('Beyoncé', { includeHiddenElements: true })).toBeNull();
  });

  it('Wellness 탭 → workout claim 렌더, brand(미매핑) 제외', async () => {
    mockFetchRouter(fetchSpy);

    renderScreen(<NewsScreen onClaimPress={jest.fn()} />);
    await screen.findByText('plant-based reset');

    fireEvent.press(screen.getByText('Wellness'));

    expect(await screen.findByText('the iron paradise split')).toBeTruthy();
    // brand claim 은 어느 카테고리에도 매핑되지 않으므로 노출 안 됨.
    expect(screen.queryByText('project rock protein launch')).toBeNull();
    // diet 탭 claim 은 Wellness 에서 미렌더.
    expect(screen.queryByText('plant-based reset')).toBeNull();
  });

  it('카드 탭 → onClaimPress(claimId) 호출', async () => {
    mockFetchRouter(fetchSpy);
    const onClaimPress = jest.fn();

    renderScreen(<NewsScreen onClaimPress={onClaimPress} />);
    const label = `Beyoncé: ${FOOD_CLAIM['headline'] as string}`;
    await screen.findByLabelText(label);

    fireEvent.press(screen.getByLabelText(label));

    expect(onClaimPress).toHaveBeenCalledWith(FOOD_CLAIM['id']);
  });

  it('claims fetch 실패 → error state + 재시도 버튼', async () => {
    mockFetchRouter(fetchSpy, {
      claims: makeResponse(500, { error: { code: 'INTERNAL', message: 'boom' } }),
    });

    renderScreen(<NewsScreen onClaimPress={jest.fn()} />);

    expect(await screen.findByText("Couldn't load news.")).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });
});
