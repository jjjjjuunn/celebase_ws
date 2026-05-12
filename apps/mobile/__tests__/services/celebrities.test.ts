jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { ApiError } from '../../src/lib/api-client';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';
import { listCelebrities } from '../../src/services/celebrities';

describe('celebrities service', () => {
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

  function makeResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ITEM = {
    id: '018d1a6a-0000-7000-8000-000000000040',
    slug: 'beyonce',
    display_name: '비욘세',
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

  it('파라미터 없이 호출 → /api/celebrities (query 없음)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { items: [ITEM], next_cursor: null, has_next: false }),
    );

    const res = await listCelebrities();

    expect(res.items).toHaveLength(1);
    expect(res.items[0].slug).toBe('beyonce');
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/celebrities');
  });

  it('cursor + limit 전달 → query string 부착', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { items: [], next_cursor: null, has_next: false }),
    );

    await listCelebrities({ cursor: 'xyz', limit: 50 });

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('cursor=xyz');
    expect(url).toContain('limit=50');
  });

  it('5xx → ApiError throw', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(500, { error: { code: 'INTERNAL', message: 'boom' } }),
    );

    await expect(listCelebrities()).rejects.toBeInstanceOf(ApiError);
  });
});
