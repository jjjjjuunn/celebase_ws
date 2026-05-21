// CelebrityPicker — 그리드 로드 / 선택 콜백 / 하이라이트 / 에러 상태 검증.
// 실제 listCelebrities 경로를 태우고 globalThis.fetch 만 스파이한다.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';

import { CelebrityPicker } from '../../src/components/CelebrityPicker';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';

const CELEB = {
  id: '018d1a6a-0000-7000-8000-000000000040',
  slug: 'beyonce',
  display_name: 'Beyoncé',
  short_bio: null,
  avatar_url: 'https://example.com/avatar.jpg',
  cover_image_url: null,
  category: 'diet' as const,
  tags: [],
  is_featured: true,
  sort_order: 1,
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

describe('<CelebrityPicker />', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPendingRefresh();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('loaded → 카드 렌더 (Select <name> 라벨)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
    );

    render(<CelebrityPicker onSelect={jest.fn()} />);

    expect(await screen.findByLabelText('Select Beyoncé')).toBeTruthy();
  });

  it('카드 탭 → onSelect(celebrity) 호출', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
    );
    const onSelect = jest.fn();

    render(<CelebrityPicker onSelect={onSelect} />);
    fireEvent.press(await screen.findByLabelText('Select Beyoncé'));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ slug: 'beyonce' }));
  });

  it('selectedSlug 일치 카드 → accessibilityState.selected = true', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
    );

    render(<CelebrityPicker selectedSlug="beyonce" onSelect={jest.fn()} />);

    expect(await screen.findByLabelText('Select Beyoncé')).toBeSelected();
  });

  it('fetch 실패 → 에러 메시지', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(500, { error: { code: 'INTERNAL', message: 'boom' } }),
    );

    render(<CelebrityPicker onSelect={jest.fn()} />);

    expect(await screen.findByText("Couldn't load celebrities.")).toBeTruthy();
  });
});
