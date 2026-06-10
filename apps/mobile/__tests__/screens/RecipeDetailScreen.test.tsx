// RecipeDetailScreen — 에디토리얼 재구성(IMPL-MOBILE-RECIPE-DETAIL-EDITORIAL-001): eyebrow(meal_type)·
// 큰 serif 타이틀·meta 칩·영양 stat 룰밴드·WHY IT FITS·재료 divider 행. 어댑티브 히어로(image_url
// 있으면 contained photo 밴드, 없으면 생략 — void 제거). Recipe 탭 = 풀스크린 RecipeSteps 오버레이
// (별도 Cook Mode 버튼/모달 없음). 실제 서비스 경로(getRecipeDetail)를 태우고 globalThis.fetch 만 url
// 로 라우팅. 시각 리듬·display 크기는 기기검증.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: (): boolean => true }));

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

  it('mount → eyebrow(meal_type) + 제목 + stat 4매크로 + 재료 preparation 표기', async () => {
    mockDetail(fetchSpy);
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);

    expect(await screen.findByText('Savory Oat Bowl')).toBeTruthy();
    expect(screen.getByText('breakfast')).toBeTruthy(); // eyebrow(meal_type) — label 변형은 시각만, 텍스트는 원문
    // stat 룰밴드 4매크로 라벨
    expect(screen.getByText('Calories')).toBeTruthy();
    expect(screen.getByText('Protein')).toBeTruthy();
    expect(screen.getByText('Carbs')).toBeTruthy();
    expect(screen.getByText('Fat')).toBeTruthy();
    expect(screen.getByText('Rolled Oats (0.5 cup)')).toBeTruthy();
    expect(screen.getByText('Zucchini (0.5 medium · sliced)')).toBeTruthy();
  });

  it('어댑티브 히어로 — image_url 부재 → photo 밴드 미렌더(어두운 void 회귀가드)', async () => {
    mockDetail(fetchSpy); // RECIPE.image_url === null
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');
    expect(screen.queryByTestId('recipe-photo-band')).toBeNull();
  });

  it('어댑티브 히어로 — image_url 존재 → contained photo 밴드 렌더', async () => {
    mockDetail(fetchSpy, { recipe: { ...RECIPE, image_url: 'https://example.com/oat.jpg' } });
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');
    expect(screen.getByTestId('recipe-photo-band')).toBeTruthy();
  });

  it('별도 "Start cook mode" 버튼 부재(통합됨)', async () => {
    mockDetail(fetchSpy);
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');
    expect(screen.queryByLabelText('Start cook mode')).toBeNull();
  });

  it('Recipe 탭 → 몰입 step view 오버레이(counter)', async () => {
    mockDetail(fetchSpy);
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');

    fireEvent.press(screen.getByText('Recipe'));
    expect(await screen.findByText('STEP 1 OF 3')).toBeTruthy();
    expect(screen.getByText('Boil the oats until creamy.')).toBeTruthy();
  });

  it('onDone → Ingredients 개요 복귀 + step 뷰 사라짐', async () => {
    mockDetail(fetchSpy);
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');

    fireEvent.press(screen.getByText('Recipe'));
    await screen.findByText('STEP 1 OF 3');
    fireEvent.press(screen.getByLabelText('Next step'));
    fireEvent.press(screen.getByLabelText('Next step')); // → 마지막
    fireEvent.press(screen.getByLabelText('Done'));

    expect(screen.queryByText('STEP 3 OF 3')).toBeNull();
    expect(screen.getByText('Rolled Oats (0.5 cup)')).toBeTruthy();
  });

  it('헤더 back(⌄) → 개요 복귀(이탈)', async () => {
    mockDetail(fetchSpy);
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');

    fireEvent.press(screen.getByText('Recipe'));
    await screen.findByText('STEP 1 OF 3');
    fireEvent.press(screen.getByLabelText('Exit step view'));
    expect(screen.queryByText('STEP 1 OF 3')).toBeNull();
    expect(screen.getByText('Rolled Oats (0.5 cup)')).toBeTruthy();
  });

  it('Ingredients 왕복 후 Recipe 재진입 시 같은 스텝 보존(amnesia 회귀)', async () => {
    mockDetail(fetchSpy);
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');

    fireEvent.press(screen.getByText('Recipe'));
    await screen.findByText('STEP 1 OF 3');
    fireEvent.press(screen.getByLabelText('Next step')); // step 2
    expect(screen.getByText('STEP 2 OF 3')).toBeTruthy();

    fireEvent.press(screen.getByText('Ingredients')); // 이탈
    fireEvent.press(screen.getByText('Recipe')); // 재진입
    expect(screen.getByText('STEP 2 OF 3')).toBeTruthy(); // Step 1 로 리셋되지 않음
  });

  it('instructions 없음 → Recipe 탭에 step 오버레이 미노출(안내)', async () => {
    mockDetail(fetchSpy, { recipe: { ...RECIPE, instructions: [] } });
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');

    fireEvent.press(screen.getByText('Recipe'));
    expect(await screen.findByText('조리 단계가 아직 없어요.')).toBeTruthy();
    expect(screen.queryByText(/STEP 1 OF/)).toBeNull();
  });
});
