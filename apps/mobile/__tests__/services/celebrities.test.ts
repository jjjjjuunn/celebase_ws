jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { ApiError } from '../../src/lib/api-client';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';
import {
  getBaseDiet,
  getCelebrityDiets,
  listCelebrities,
} from '../../src/services/celebrities';

const BASE_DIET_ID = '018d1a6a-0000-7000-8000-000000000050';
const CELEB_DIET_OWNER_ID = '018d1a6a-0000-7000-8000-000000000051';

// content-service unwrapped BaseDietWire (base-diets BFF 통합 테스트 fixture 미러).
const BASE_DIET = {
  id: BASE_DIET_ID,
  celebrity_id: CELEB_DIET_OWNER_ID,
  name: "Ariana's Plant-Based Japanese Diet",
  description: 'A whole-food, plant-based approach.',
  philosophy: 'Vegan since 2013.',
  diet_type: 'vegan' as const,
  avg_daily_kcal: 2000,
  macro_ratio: { protein_pct: 15, carbs_pct: 60, fat_pct: 25 },
  included_foods: ['tofu', 'tempeh', 'edamame'],
  excluded_foods: ['meat', 'dairy'],
  key_supplements: ['B12', 'Vitamin D'],
  source_refs: [{ type: 'interview', outlet: 'The Mirror', date: '2013-11-15' }],
  verified_by: null,
  last_verified_at: '2026-05-20T01:42:43.750Z',
  version: 1,
  is_active: true,
  created_at: '2026-04-23T00:00:00.000Z',
  updated_at: '2026-04-23T00:00:00.000Z',
};

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

  it('getCelebrityDiets → { diets: [...] } 파싱 + slug 인코딩', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(200, { diets: [BASE_DIET] }));

    const res = await getCelebrityDiets('ariana-grande');

    expect(res.diets).toHaveLength(1);
    expect(res.diets[0].id).toBe(BASE_DIET_ID);
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/celebrities/ariana-grande/diets');
  });

  it('getBaseDiet → { base_diet } 파싱 (celebrity_id 역방향 조인용)', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(200, { base_diet: BASE_DIET }));

    const res = await getBaseDiet(BASE_DIET_ID);

    expect(res.base_diet.celebrity_id).toBe(CELEB_DIET_OWNER_ID);
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://localhost:3000/api/base-diets/${BASE_DIET_ID}`);
  });
});
