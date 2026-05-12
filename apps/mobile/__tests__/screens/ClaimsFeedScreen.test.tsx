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
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { claims: [CLAIM_FIXTURE], next_cursor: null, has_next: false }),
    );

    render(<ClaimsFeedScreen onClaimPress={jest.fn()} />);

    expect(await screen.findByText('celery juice ritual')).toBeTruthy();
  });

  it('빈 응답 → empty state 노출', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { claims: [], next_cursor: null, has_next: false }),
    );

    render(<ClaimsFeedScreen onClaimPress={jest.fn()} />);

    expect(await screen.findByText('아직 등록된 claim 이 없습니다.')).toBeTruthy();
  });

  it('fetch 실패 → error state + 재시도 버튼', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(500, { error: { code: 'INTERNAL', message: 'boom' } }),
    );

    render(<ClaimsFeedScreen onClaimPress={jest.fn()} />);

    expect(await screen.findByText('불러오기에 실패했습니다.')).toBeTruthy();
    expect(screen.getByText('다시 시도')).toBeTruthy();
  });

  it('카테고리 탭 클릭 → list reset + claim_type query 부착 재호출', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        makeResponse(200, { claims: [CLAIM_FIXTURE], next_cursor: null, has_next: false }),
      )
      .mockResolvedValueOnce(
        makeResponse(200, { claims: [], next_cursor: null, has_next: false }),
      );

    render(<ClaimsFeedScreen onClaimPress={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    fireEvent.press(screen.getByText('운동'));

    await waitFor(() => {
      // 2번째 호출 url 에 claim_type=workout 포함
      const [secondUrl] = fetchSpy.mock.calls[1] as [string, RequestInit];
      expect(secondUrl).toContain('claim_type=workout');
    });
  });

  it('카드 탭 → onClaimPress 콜백 호출', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { claims: [CLAIM_FIXTURE], next_cursor: null, has_next: false }),
    );
    const onClaimPress = jest.fn();

    render(<ClaimsFeedScreen onClaimPress={onClaimPress} />);
    await screen.findByLabelText(`claim ${CLAIM_FIXTURE.headline}`);

    fireEvent.press(screen.getByLabelText(`claim ${CLAIM_FIXTURE.headline}`));

    expect(onClaimPress).toHaveBeenCalledWith(CLAIM_FIXTURE.id);
  });
});
