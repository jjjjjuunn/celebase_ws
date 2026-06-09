// RecipeDetailScreen — Hero/영양/Highlights/Ingredients·Recipe 탭 + Cook Mode 진입 + preparation/tips.
// 실제 서비스 경로(getRecipeDetail)를 태우고 globalThis.fetch 만 url 로 라우팅.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { RecipeDetailScreen } from '../../src/screens/RecipeDetailScreen';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';
import { ThemeProvider } from '../../src/ui';

function renderScreen(ui: ReactElement): ReturnType<typeof render> {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const RECIPE = {
  id: '01927000-0000-7000-8000-000000000200',
  base_diet_id: '018d1a6a-0000-7000-8000-000000000050',
  title: 'Savory Oat Bowl',
  slug: 'savory-oat-bowl',
  description: null,
  meal_type: 'breakfast' as const,
  prep_time_min: 7,
  cook_time_min: 10,
  servings: 1,
  difficulty: 'easy' as const,
  nutrition: { calories: 290, protein_g: 19, carbs_g: 33, fat_g: 7, fiber_g: 5, sugar_g: 4, sodium_mg: 360 },
  instructions: [
    { step: 1, text: 'Boil the oats until creamy.', duration_min: 6 },
    { step: 2, text: 'Saute the zucchini until golden.', duration_min: 5 },
    { step: 3, text: 'Add egg whites and finish with lemon.', duration_min: 2 },
  ],
  tips: 'Use white miso for a milder flavor.',
  image_url: null,
  video_url: null,
  citations: [],
  allergens: [],
  is_active: true,
  created_at: '2026-05-13T00:00:00.000Z',
  updated_at: '2026-05-13T00:00:00.000Z',
};

const INGREDIENTS = [
  { name: 'Rolled Oats', quantity: 0.5, unit: 'cup', preparation: null, is_optional: false },
  { name: 'Zucchini', quantity: 0.5, unit: 'medium', preparation: 'sliced', is_optional: false },
];

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface DetailOverride {
  recipe?: Record<string, unknown>;
  ingredients?: unknown[];
}

function mockDetail(fetchSpy: jest.SpyInstance, o: DetailOverride = {}): void {
  const recipe = o.recipe ?? RECIPE;
  const ingredients = o.ingredients ?? INGREDIENTS;
  fetchSpy.mockImplementation((url: string) => {
    if (url.includes('/api/recipes/')) {
      return Promise.resolve(makeResponse(200, { recipe, ingredients }));
    }
    return Promise.reject(new Error(`unmocked ${url}`));
  });
}

describe('<RecipeDetailScreen />', () => {
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

  it('mount → 제목 + 영양 + (기본) 재료 탭 preparation 표기', async () => {
    mockDetail(fetchSpy);
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);

    expect(await screen.findByText('Savory Oat Bowl')).toBeTruthy();
    expect(screen.getByText('Calories')).toBeTruthy(); // 영양 카드 렌더
    // 기본 탭 = Ingredients → preparation 표기(빈/null 은 생략, sliced 는 표기).
    expect(screen.getByText('Rolled Oats (0.5 cup)')).toBeTruthy();
    expect(screen.getByText('Zucchini (0.5 medium · sliced)')).toBeTruthy();
  });

  it('Cook Mode 버튼 → 모달 진입(Step 1 of 3)', async () => {
    mockDetail(fetchSpy);
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');

    fireEvent.press(screen.getByLabelText('Start cook mode'));
    expect(await screen.findByText('Step 1 of 3')).toBeTruthy();
  });

  it('instructions 없음 → Cook Mode 버튼 미노출', async () => {
    mockDetail(fetchSpy, { recipe: { ...RECIPE, instructions: [] } });
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');

    expect(screen.queryByLabelText('Start cook mode')).toBeNull();
  });

  it('Recipe 탭: tips 있으면 TIP 콜아웃', async () => {
    mockDetail(fetchSpy);
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');

    fireEvent.press(screen.getByText('Recipe')); // 탭 전환
    expect(await screen.findByText('TIP')).toBeTruthy();
    expect(screen.getByText('Use white miso for a milder flavor.')).toBeTruthy();
  });

  it('Recipe 탭: tips null → TIP 미노출(회귀 가드 — 시드 ~78% 누락)', async () => {
    mockDetail(fetchSpy, { recipe: { ...RECIPE, tips: null } });
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');

    fireEvent.press(screen.getByText('Recipe'));
    // 스텝은 보이되 TIP 콜아웃은 없어야 한다.
    expect(await screen.findByText('Boil the oats until creamy.')).toBeTruthy();
    expect(screen.queryByText('TIP')).toBeNull();
  });
});
