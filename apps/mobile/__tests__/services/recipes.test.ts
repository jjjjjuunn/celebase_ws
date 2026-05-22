jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';
import { getRecipesByIds } from '../../src/services/recipes';

const RECIPE_A = {
  id: '01927000-0000-7000-8000-0000000000a1',
  base_diet_id: '01927000-0000-7000-8000-000000000050',
  title: 'Grilled Chicken & Quinoa',
  slug: 'grilled-chicken-quinoa',
  description: null,
  meal_type: 'lunch' as const,
  prep_time_min: 10,
  cook_time_min: 20,
  servings: 1,
  difficulty: null,
  nutrition: { calories: 540, protein_g: 45, carbs_g: 50, fat_g: 18 },
  instructions: [],
  tips: null,
  image_url: null,
  video_url: null,
  citations: [],
  is_active: true,
  created_at: '2026-05-13T00:00:00.000Z',
  updated_at: '2026-05-13T00:00:00.000Z',
};

describe('recipes service', () => {
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

  it('빈 id 목록이면 네트워크 호출 없이 빈 응답을 반환한다', async () => {
    const res = await getRecipesByIds([]);
    expect(res).toEqual({ recipes: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('id 목록을 콤마로 합쳐 /api/recipes?ids= 로 batch 조회하고 파싱한다', async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, { recipes: [RECIPE_A] }));

    const res = await getRecipesByIds([RECIPE_A.id, '01927000-0000-7000-8000-0000000000a2']);

    expect(res.recipes).toHaveLength(1);
    expect(res.recipes[0]?.title).toBe('Grilled Chicken & Quinoa');
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/recipes?ids=');
    expect(url).toContain(RECIPE_A.id);
    expect(url).toContain('0000000000a2');
  });
});
