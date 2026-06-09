// RecipeDetailScreen — Hero/영양/Highlights/Ingredients·Recipe(몰입 step view) 통합.
// Recipe 탭 = RecipeSteps(별도 Cook Mode 버튼/모달 없음). 실제 서비스 경로(getRecipeDetail)를
// 태우고 globalThis.fetch 만 url 로 라우팅. scroll-lock 은 prop 레벨 검증(실제 스크롤은 기기검증).

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

// jest 는 onLayout 을 자동 발화하지 않으므로, lock 이 engage 하려면 tabBar y 를 수동 주입한다.
function layoutTabBar(): void {
  fireEvent(screen.getByTestId('recipe-tabbar'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 250, width: 320, height: 48 } },
  });
}

// outer ScrollView 의 scrollEnabled prop (lockOuter 의 prop-레벨 검증).
function outerScrollEnabled(): boolean | undefined {
  const el = screen.getByTestId('recipe-detail-scroll') as unknown as {
    props: { scrollEnabled?: boolean };
  };
  return el.props.scrollEnabled;
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
    expect(screen.getByText('Calories')).toBeTruthy();
    expect(screen.getByText('Rolled Oats (0.5 cup)')).toBeTruthy();
    expect(screen.getByText('Zucchini (0.5 medium · sliced)')).toBeTruthy();
  });

  it('별도 "Start cook mode" 버튼 부재(통합됨)', async () => {
    mockDetail(fetchSpy);
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');
    expect(screen.queryByLabelText('Start cook mode')).toBeNull();
  });

  it('Recipe 탭 → 몰입 step view(counter) + outer 잠금', async () => {
    mockDetail(fetchSpy);
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');

    layoutTabBar();
    fireEvent.press(screen.getByText('Recipe'));

    expect(await screen.findByText('STEP 1 OF 3')).toBeTruthy();
    expect(outerScrollEnabled()).toBe(false);
  });

  it('onDone → Ingredients 개요 복귀 + outer 잠금해제', async () => {
    mockDetail(fetchSpy);
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');

    layoutTabBar();
    fireEvent.press(screen.getByText('Recipe'));
    await screen.findByText('STEP 1 OF 3');
    fireEvent.press(screen.getByLabelText('Next step'));
    fireEvent.press(screen.getByLabelText('Next step')); // → 마지막
    fireEvent.press(screen.getByLabelText('Done'));

    // 개요(Ingredients 탭)로 복귀, step 뷰 사라짐, outer 스크롤 복원.
    expect(screen.queryByText('STEP 3 OF 3')).toBeNull();
    expect(screen.getByText('Rolled Oats (0.5 cup)')).toBeTruthy();
    expect(outerScrollEnabled()).toBe(true);
  });

  it('Ingredients 왕복 후 Recipe 재진입 시 같은 스텝 보존(amnesia 회귀)', async () => {
    mockDetail(fetchSpy);
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');

    layoutTabBar();
    fireEvent.press(screen.getByText('Recipe'));
    await screen.findByText('STEP 1 OF 3');
    fireEvent.press(screen.getByLabelText('Next step')); // step 2
    expect(screen.getByText('STEP 2 OF 3')).toBeTruthy();

    fireEvent.press(screen.getByText('Ingredients')); // 이탈
    fireEvent.press(screen.getByText('Recipe')); // 재진입
    expect(screen.getByText('STEP 2 OF 3')).toBeTruthy(); // Step 1 로 리셋되지 않음
  });

  it('instructions 없음 → Recipe 탭에 step 뷰 미노출(안내)', async () => {
    mockDetail(fetchSpy, { recipe: { ...RECIPE, instructions: [] } });
    renderScreen(<RecipeDetailScreen recipeId={RECIPE.id} onBack={jest.fn()} />);
    await screen.findByText('Savory Oat Bowl');

    layoutTabBar();
    fireEvent.press(screen.getByText('Recipe'));
    expect(await screen.findByText('조리 단계가 아직 없어요.')).toBeTruthy();
    expect(screen.queryByText(/STEP 1 OF/)).toBeNull();
  });
});
