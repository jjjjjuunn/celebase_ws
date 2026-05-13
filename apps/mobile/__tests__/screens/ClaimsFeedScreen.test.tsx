jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ClaimsFeedScreen } from '../../src/screens/ClaimsFeedScreen';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';

const CLAIM_FIXTURE = {
  id: '01927000-0000-7000-8000-000000000001',
  celebrity_id: '018d1a6a-0000-7000-8000-000000000040',
  claim_type: 'food' as const,
  headline: 'celery juice ritual',
  body: null,
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
};

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// fixture trust_grade = 'C' (lockable threshold 는 A/B 이므로 'free' tier 에서도 unlocked)
// — 본 테스트 스위트는 claim feed list 동작만 검증. tier gating 은 별도 unit.
const CLAIM_FIXTURE_UNLOCKED = { ...CLAIM_FIXTURE, trust_grade: 'C' as const };

// useCurrentTier 가 호출하는 GET /api/subscriptions/me 응답 (free tier).
const SUBSCRIPTION_FREE = { subscription: null };

/**
 * fetch mock router — claims feed + subscription me 두 endpoint 라우팅.
 * 호출 URL 패턴으로 분기. 미정의 path 는 빈 200 응답.
 */
function mockFetchRouter(
  fetchSpy: jest.SpyInstance,
  routes: { claims?: Response | (() => Response); claimsList?: Response[] },
): void {
  let claimsCallIndex = 0;
  fetchSpy.mockImplementation((url: string | URL | Request) => {
    const urlStr =
      typeof url === 'string'
        ? url
        : url instanceof URL
          ? url.href
          : url.url;
    if (urlStr.includes('/api/subscriptions/me')) {
      return Promise.resolve(makeResponse(200, SUBSCRIPTION_FREE));
    }
    if (urlStr.includes('/api/claims/feed')) {
      if (routes.claimsList !== undefined) {
        const res = routes.claimsList[claimsCallIndex] ?? makeResponse(200, { claims: [], next_cursor: null, has_next: false });
        claimsCallIndex += 1;
        return Promise.resolve(res);
      }
      const single = typeof routes.claims === 'function' ? routes.claims() : routes.claims;
      return Promise.resolve(single ?? makeResponse(200, { claims: [], next_cursor: null, has_next: false }));
    }
    return Promise.resolve(makeResponse(200, {}));
  });
}

describe('<ClaimsFeedScreen />', () => {
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

  it('첫 페이지 로드 → 카드 headline 노출', async () => {
    mockFetchRouter(fetchSpy, {
      claims: makeResponse(200, { claims: [CLAIM_FIXTURE_UNLOCKED], next_cursor: null, has_next: false }),
    });

    render(<ClaimsFeedScreen onClaimPress={jest.fn()} />);

    expect(await screen.findByText('celery juice ritual')).toBeTruthy();
  });

  it('빈 응답 → empty state 노출', async () => {
    mockFetchRouter(fetchSpy, {
      claims: makeResponse(200, { claims: [], next_cursor: null, has_next: false }),
    });

    render(<ClaimsFeedScreen onClaimPress={jest.fn()} />);

    expect(await screen.findByText('No claims yet.')).toBeTruthy();
  });

  it('fetch 실패 → error state + 재시도 버튼', async () => {
    mockFetchRouter(fetchSpy, {
      claims: makeResponse(500, { error: { code: 'INTERNAL', message: 'boom' } }),
    });

    render(<ClaimsFeedScreen onClaimPress={jest.fn()} />);

    expect(await screen.findByText("Couldn't load claims.")).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('카테고리 탭 클릭 → list reset + claim_type query 부착 재호출', async () => {
    mockFetchRouter(fetchSpy, {
      claimsList: [
        makeResponse(200, { claims: [CLAIM_FIXTURE_UNLOCKED], next_cursor: null, has_next: false }),
        makeResponse(200, { claims: [], next_cursor: null, has_next: false }),
      ],
    });

    render(<ClaimsFeedScreen onClaimPress={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    fireEvent.press(screen.getByText('Fitness'));

    await waitFor(() => {
      const calls = fetchSpy.mock.calls as Array<[unknown, unknown]>;
      const workoutCall = calls.find(
        ([url]) => typeof url === 'string' && url.includes('claim_type=workout'),
      );
      expect(workoutCall).toBeTruthy();
    });
  });

  it('카드 탭 → onClaimPress 콜백 호출', async () => {
    mockFetchRouter(fetchSpy, {
      claims: makeResponse(200, { claims: [CLAIM_FIXTURE_UNLOCKED], next_cursor: null, has_next: false }),
    });
    const onClaimPress = jest.fn();

    render(<ClaimsFeedScreen onClaimPress={onClaimPress} />);
    await screen.findByLabelText(`claim ${CLAIM_FIXTURE_UNLOCKED.headline}`);

    fireEvent.press(screen.getByLabelText(`claim ${CLAIM_FIXTURE_UNLOCKED.headline}`));

    expect(onClaimPress).toHaveBeenCalledWith(CLAIM_FIXTURE_UNLOCKED.id);
  });
});
