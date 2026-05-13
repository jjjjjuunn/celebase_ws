// CelebrityDetailScreen integration — 두 fetch 병렬 (celeb + claims) + tier-aware lock.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CelebrityDetailScreen } from '../../src/screens/CelebrityDetailScreen';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';

const CELEB = {
  id: '018d1a6a-0000-7000-8000-000000000040',
  slug: 'gwyneth-paltrow',
  display_name: 'Gwyneth Paltrow',
  short_bio: 'Wellness icon and entrepreneur.',
  avatar_url: 'https://example.com/gwyneth.jpg',
  cover_image_url: null,
  category: 'lifestyle' as const,
  tags: ['wellness', 'beauty'],
  is_featured: true,
  sort_order: 1,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const CLAIM_C = {
  id: '01927000-0000-7000-8000-000000000001',
  celebrity_id: CELEB.id,
  claim_type: 'food' as const,
  headline: 'celery juice ritual',
  body: null,
  trust_grade: 'C' as const,
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

const CLAIM_A_LOCKED = { ...CLAIM_C, id: '01927000-0000-7000-8000-000000000002', headline: 'secret nutrition protocol', trust_grade: 'A' as const };

const SUBSCRIPTION_FREE = { subscription: null };

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockRouter(
  fetchSpy: jest.SpyInstance,
  routes: {
    celeb?: Response;
    claims?: Response;
    celebError?: boolean;
  },
): void {
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
    if (urlStr.includes('/claims')) {
      return Promise.resolve(routes.claims ?? makeResponse(200, { claims: [], next_cursor: null, has_next: false }));
    }
    if (urlStr.includes('/api/celebrities/')) {
      if (routes.celebError === true) return Promise.resolve(makeResponse(500, { error: { code: 'INTERNAL' } }));
      return Promise.resolve(routes.celeb ?? makeResponse(200, { celebrity: CELEB }));
    }
    return Promise.resolve(makeResponse(200, {}));
  });
}

describe('<CelebrityDetailScreen />', () => {
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

  it('성공 → header (이름 + 카테고리 + bio) + claim list', async () => {
    mockRouter(fetchSpy, {
      claims: makeResponse(200, { claims: [CLAIM_C], next_cursor: null, has_next: false }),
    });

    render(
      <CelebrityDetailScreen slug="gwyneth-paltrow" onBack={jest.fn()} onClaimPress={jest.fn()} />,
    );

    expect(await screen.findByText('Gwyneth Paltrow')).toBeTruthy();
    expect(screen.getByText('LIFESTYLE')).toBeTruthy();
    expect(screen.getByText('Wellness icon and entrepreneur.')).toBeTruthy();
    expect(screen.getByText('celery juice ritual')).toBeTruthy();
  });

  it('claim list 비어있음 → empty state 메시지', async () => {
    mockRouter(fetchSpy, {
      claims: makeResponse(200, { claims: [], next_cursor: null, has_next: false }),
    });

    render(
      <CelebrityDetailScreen slug="gwyneth-paltrow" onBack={jest.fn()} onClaimPress={jest.fn()} />,
    );

    expect(
      await screen.findByText('No claims yet for Gwyneth Paltrow.'),
    ).toBeTruthy();
  });

  it('잠긴 claim (trust A + free tier) 탭 → onClaimPress 미호출 (silent block)', async () => {
    mockRouter(fetchSpy, {
      claims: makeResponse(200, { claims: [CLAIM_A_LOCKED], next_cursor: null, has_next: false }),
    });
    const onClaimPress = jest.fn();

    render(
      <CelebrityDetailScreen slug="gwyneth-paltrow" onBack={jest.fn()} onClaimPress={onClaimPress} />,
    );

    await screen.findByText('secret nutrition protocol');
    fireEvent.press(screen.getByText('secret nutrition protocol'));

    // 잠긴 claim — onClaimPress 호출 안 됨. 짧게 기다려서 비호출 확인.
    await waitFor(() => {
      expect(onClaimPress).not.toHaveBeenCalled();
    });
  });

  it('잠금 안된 claim (trust C + free) 탭 → onClaimPress 호출', async () => {
    mockRouter(fetchSpy, {
      claims: makeResponse(200, { claims: [CLAIM_C], next_cursor: null, has_next: false }),
    });
    const onClaimPress = jest.fn();

    render(
      <CelebrityDetailScreen slug="gwyneth-paltrow" onBack={jest.fn()} onClaimPress={onClaimPress} />,
    );

    await screen.findByText('celery juice ritual');
    fireEvent.press(screen.getByText('celery juice ritual'));

    await waitFor(() => {
      expect(onClaimPress).toHaveBeenCalledWith(CLAIM_C.id);
    });
  });

  it('Back 버튼 → onBack 호출', () => {
    mockRouter(fetchSpy, {
      claims: makeResponse(200, { claims: [], next_cursor: null, has_next: false }),
    });
    const onBack = jest.fn();

    render(
      <CelebrityDetailScreen slug="gwyneth-paltrow" onBack={onBack} onClaimPress={jest.fn()} />,
    );

    fireEvent.press(screen.getByTestId('celebrity-detail-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('celebrity fetch 실패 → error state', async () => {
    mockRouter(fetchSpy, { celebError: true });

    render(
      <CelebrityDetailScreen slug="gwyneth-paltrow" onBack={jest.fn()} onClaimPress={jest.fn()} />,
    );

    expect(await screen.findByText("Couldn't load celebrity details.")).toBeTruthy();
  });
});
