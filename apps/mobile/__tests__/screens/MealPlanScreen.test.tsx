// MealPlanScreen — 3-state 게이트(미온보딩/생성가능/소진) + 캘린더 + 시트 + focus refresh.
// 실제 서비스 경로를 태우고 globalThis.fetch 만 url 로 라우팅한다.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { MealPlanScreen } from '../../src/screens/MealPlanScreen';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';
import { ThemeProvider } from '../../src/ui';

// Screen now consumes useTheme() — every render must be inside ThemeProvider.
function renderScreen(ui: ReactElement): ReturnType<typeof render> {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const BASE_DIET_ID = '018d1a6a-0000-7000-8000-000000000050';
const CELEB_ID = '018d1a6a-0000-7000-8000-000000000040';

const CELEB = {
  id: CELEB_ID,
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

const BASE_DIET = {
  id: BASE_DIET_ID,
  celebrity_id: CELEB_ID,
  name: "Beyoncé's Plan",
  description: null,
  philosophy: null,
  diet_type: 'omnivore' as const,
  avg_daily_kcal: 1800,
  macro_ratio: { protein_pct: 30, carbs_pct: 40, fat_pct: 30 },
  included_foods: [],
  excluded_foods: [],
  key_supplements: [],
  source_refs: [],
  verified_by: null,
  last_verified_at: '2026-05-20T01:42:43.750Z',
  version: 1,
  is_active: true,
  created_at: '2026-04-23T00:00:00.000Z',
  updated_at: '2026-04-23T00:00:00.000Z',
};

// 5일 스트립은 오늘 중앙 ±2일을 보여주고 default 선택일 = 오늘, default 끼니 = breakfast.
// 따라서 plan 의 날짜를 "오늘"로 맞춰야 breakfast meal 이 화면에 노출된다.
function todayISO(): string {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const PLAN = {
  id: '01927000-0000-7000-8000-000000000010',
  user_id: '01927000-0000-7000-8000-000000000001',
  base_diet_id: BASE_DIET_ID,
  name: 'Plan',
  status: 'active' as const,
  adjustments: {},
  start_date: todayISO(),
  end_date: todayISO(),
  daily_plans: [
    {
      day: 1,
      date: todayISO(),
      meals: [
        {
          meal_type: 'breakfast',
          recipe_id: '01927000-0000-7000-8000-000000000100',
          adjusted_nutrition: { calories: 420, protein_g: 28, carbs_g: 38, fat_g: 16 },
          narrative: 'Greek yogurt with honey.',
        },
      ],
      daily_totals: { calories: 1800, protein_g: 120, carbs_g: 180, fat_g: 60 },
    },
  ],
  created_at: '2026-05-13T00:00:00.000Z',
  updated_at: '2026-05-13T00:00:00.000Z',
  deleted_at: null,
};

const RECIPE = {
  id: '01927000-0000-7000-8000-000000000100', // matches PLAN meal recipe_id
  base_diet_id: BASE_DIET_ID,
  title: 'Greek Yogurt Power Bowl',
  slug: 'greek-yogurt-power-bowl',
  description: null,
  meal_type: 'breakfast' as const,
  prep_time_min: 5,
  cook_time_min: 0,
  servings: 1,
  difficulty: null,
  nutrition: { calories: 420, protein_g: 28, carbs_g: 38, fat_g: 16 },
  instructions: [],
  tips: null,
  image_url: null,
  video_url: null,
  citations: [],
  is_active: true,
  created_at: '2026-05-13T00:00:00.000Z',
  updated_at: '2026-05-13T00:00:00.000Z',
};

const BIO_PROFILE = {
  id: '01927000-0000-7000-8000-000000000001',
  user_id: '01927000-0000-7000-8000-000000000002',
  birth_year: null,
  sex: null,
  height_cm: null,
  weight_kg: null,
  waist_cm: null,
  body_fat_pct: null,
  activity_level: null,
  sleep_hours_avg: null,
  stress_level: null,
  allergies: [],
  intolerances: [],
  medical_conditions: [],
  medications: [],
  biomarkers: {},
  primary_goal: null,
  secondary_goals: [],
  exercise_sessions: [],
  goal_pace: 'moderate',
  diet_type: null,
  cuisine_preferences: [],
  disliked_ingredients: [],
  bmr_kcal: null,
  tdee_kcal: null,
  target_kcal: null,
  macro_targets: { protein_g: 0, carbs_g: 0, fat_g: 0 },
  version: 1,
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
};

const CREDITS_PREMIUM = {
  tier: 'premium',
  credits_remaining: 14,
  credits_total: 15,
  credits_reset_at: '2026-06-01T00:00:00.000Z',
};
const CREDITS_FREE_EMPTY = {
  tier: 'free',
  credits_remaining: 0,
  credits_total: 3,
  credits_reset_at: null,
};

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface ScreenRoutes {
  bioStatus?: number;
  credits: () => unknown;
  plans?: unknown[];
}

function routeScreen(fetchSpy: jest.SpyInstance, routes: ScreenRoutes): void {
  const bioStatus = routes.bioStatus ?? 200;
  const plans = routes.plans ?? [];
  fetchSpy.mockImplementation((url: string) => {
    const u = url;
    if (u.includes('/api/users/me/bio-profile')) {
      return Promise.resolve(
        bioStatus === 404
          ? makeResponse(404, { error: { code: 'NOT_FOUND', message: 'no profile' } })
          : makeResponse(200, { bio_profile: BIO_PROFILE }),
      );
    }
    if (u.includes('/api/meal-plans/credits')) {
      return Promise.resolve(makeResponse(200, routes.credits()));
    }
    if (u.includes('/api/base-diets/')) {
      return Promise.resolve(makeResponse(200, { base_diet: BASE_DIET }));
    }
    if (u.includes('/api/celebrities')) {
      return Promise.resolve(
        makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
      );
    }
    if (u.includes('/api/recipes')) {
      return Promise.resolve(makeResponse(200, { recipes: [RECIPE] }));
    }
    if (u.includes('/api/meal-plans')) {
      return Promise.resolve(makeResponse(200, { items: plans, next_cursor: null, has_next: false }));
    }
    return Promise.reject(new Error(`unmocked ${u}`));
  });
}

describe('<MealPlanScreen />', () => {
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

  it('미온보딩(bio 404) → 온보딩 CTA → 콜백', async () => {
    routeScreen(fetchSpy, { bioStatus: 404, credits: () => CREDITS_PREMIUM });
    const onNavigateOnboarding = jest.fn();

    renderScreen(
      <MealPlanScreen
        onNavigateOnboarding={onNavigateOnboarding}
        onNavigatePaywall={jest.fn()}
      />,
    );

    fireEvent.press(await screen.findByLabelText('온보딩하고 크레딧 3개 받기'));
    expect(onNavigateOnboarding).toHaveBeenCalledTimes(1);
  });

  it('온보딩 완료 + 잔량>0 → 헤더 크레딧 뱃지 + 생성(+) + 오늘 breakfast 끼니 표시', async () => {
    routeScreen(fetchSpy, { credits: () => CREDITS_PREMIUM, plans: [PLAN] });

    renderScreen(<MealPlanScreen onNavigateOnboarding={jest.fn()} onNavigatePaywall={jest.fn()} />);

    // 헤더 생성(+) 버튼 + compact 크레딧 뱃지(tier · 잔량).
    expect(await screen.findByLabelText('Generate meal plan')).toBeTruthy();
    expect(screen.getByText('PREMIUM · 14')).toBeTruthy();
    // default 선택: 오늘 + breakfast → recipe 제목 로컬 조인 노출. placeholder('Recipe #...') 아님.
    // (카드 이름으로 노출 → findAllByText length>0)
    expect((await screen.findAllByText('Greek Yogurt Power Bowl')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Recipe #/)).toBeNull();
    // 칼로리(이름 옆) + 소요시간(사진 우상단, prep5+cook0) + 한줄 overview(narrative) + 셀럽 기반.
    expect(screen.getByText('420 kcal')).toBeTruthy();
    expect(screen.getByText('5 min')).toBeTruthy();
    expect(screen.getByText('Greek yogurt with honey')).toBeTruthy();
    expect(await screen.findByText('Based on Beyoncé')).toBeTruthy();
  });

  it('식단 있는 날 → 좌측 기둥 4 라벨 + 끼니 있는 슬롯만 활성/강조', async () => {
    routeScreen(fetchSpy, { credits: () => CREDITS_PREMIUM, plans: [PLAN] });

    renderScreen(<MealPlanScreen onNavigateOnboarding={jest.fn()} onNavigatePaywall={jest.fn()} />);

    // 기둥에 4 끼니 라벨이 모두 노출(Breakfast 는 카드 헤더에도 등장하므로 ≥1).
    expect((await screen.findAllByText('Breakfast')).length).toBeGreaterThan(0);
    expect(screen.getByText('Lunch')).toBeTruthy();
    expect(screen.getByText('Snack')).toBeTruthy();
    expect(screen.getByText('Dinner')).toBeTruthy();

    // PLAN 은 breakfast 끼니만 → Breakfast 기둥 항목이 selected + 활성, 나머지는 disabled.
    expect(screen.getByLabelText('Breakfast')).toBeSelected();
    expect(screen.getByLabelText('Breakfast')).toBeEnabled();
    expect(screen.getByLabelText('Lunch')).toBeDisabled();
    expect(screen.getByLabelText('Dinner')).toBeDisabled();
  });

  it('잔량 0 → 업그레이드 CTA → Paywall 콜백', async () => {
    routeScreen(fetchSpy, { credits: () => CREDITS_FREE_EMPTY });
    const onNavigatePaywall = jest.fn();

    renderScreen(
      <MealPlanScreen onNavigateOnboarding={jest.fn()} onNavigatePaywall={onNavigatePaywall} />,
    );

    fireEvent.press(await screen.findByLabelText('Upgrade for credits'));
    expect(onNavigatePaywall).toHaveBeenCalledTimes(1);
  });

  it('생성(+) → 생성 시트 오픈', async () => {
    routeScreen(fetchSpy, { credits: () => CREDITS_PREMIUM, plans: [] });

    renderScreen(<MealPlanScreen onNavigateOnboarding={jest.fn()} onNavigatePaywall={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('Generate meal plan'));
    // 시트의 Generate 버튼이 나타나면 시트가 열린 것.
    expect(await screen.findByLabelText('Generate plan')).toBeTruthy();
  });

  it('생성 완료 → 내부 reloadCounter refresh 로 크레딧 뱃지 갱신(14→13)', async () => {
    const GENERATE_ACCEPT = {
      id: PLAN.id,
      status: 'queued' as const,
      estimated_completion_sec: 30,
      poll_url: `/meal-plans/${PLAN.id}`,
      ws_channel: `mealplan:${PLAN.id}`,
    };
    let generated = false;
    fetchSpy.mockImplementation((url: string, init?: RequestInit) => {
      const u = url;
      const method = init?.method ?? 'GET';
      if (u.includes('/api/users/me/bio-profile')) {
        return Promise.resolve(makeResponse(200, { bio_profile: BIO_PROFILE }));
      }
      if (u.includes('/api/meal-plans/credits')) {
        return Promise.resolve(
          makeResponse(200, generated ? { ...CREDITS_PREMIUM, credits_remaining: 13 } : CREDITS_PREMIUM),
        );
      }
      if (u.includes('/api/base-diets/')) {
        return Promise.resolve(makeResponse(200, { base_diet: BASE_DIET }));
      }
      if (u.includes('/api/celebrities/') && u.endsWith('/diets')) {
        return Promise.resolve(makeResponse(200, { diets: [BASE_DIET] }));
      }
      if (u.includes('/api/celebrities')) {
        return Promise.resolve(
          makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
        );
      }
      if (method === 'POST' && u.endsWith('/api/meal-plans')) {
        generated = true;
        return Promise.resolve(makeResponse(201, GENERATE_ACCEPT));
      }
      if (method === 'GET' && u.includes('/api/meal-plans/')) {
        return Promise.resolve(makeResponse(200, { id: PLAN.id, status: 'active', daily_plans: [] }));
      }
      if (u.includes('/api/meal-plans')) {
        return Promise.resolve(makeResponse(200, { items: [], next_cursor: null, has_next: false }));
      }
      return Promise.reject(new Error(`unmocked ${u}`));
    });

    renderScreen(<MealPlanScreen onNavigateOnboarding={jest.fn()} onNavigatePaywall={jest.fn()} />);

    expect(await screen.findByText('PREMIUM · 14')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Generate meal plan'));
    fireEvent.press(await screen.findByLabelText('Select Beyoncé'));
    fireEvent.press(screen.getByLabelText('Generate plan'));

    // onGenerated → reloadCounter 증가 → 전체 refetch → 크레딧 뱃지가 13 으로 갱신.
    expect(await screen.findByText('PREMIUM · 13')).toBeTruthy();
  });

  it('reloadKey 변경(focus refresh) → 잔량 0 → 결제 후 식단 만들기 로 갱신', async () => {
    let creditsState: unknown = CREDITS_FREE_EMPTY;
    routeScreen(fetchSpy, { credits: () => creditsState });

    const { rerender } = renderScreen(
      <MealPlanScreen onNavigateOnboarding={jest.fn()} onNavigatePaywall={jest.fn()} reloadKey={0} />,
    );

    // 초기: 잔량 0 → 업그레이드 CTA.
    expect(await screen.findByLabelText('Upgrade for credits')).toBeTruthy();

    // 사용자가 Paywall 에서 premium 구매 → 서버 잔량 갱신, focus 로 reloadKey 증가.
    creditsState = CREDITS_PREMIUM;
    rerender(
      <ThemeProvider>
        <MealPlanScreen onNavigateOnboarding={jest.fn()} onNavigatePaywall={jest.fn()} reloadKey={1} />
      </ThemeProvider>,
    );

    // 재fetch 후 stale "Upgrade" 가 아니라 생성(+) 으로 바뀌어야 한다.
    expect(await screen.findByLabelText('Generate meal plan')).toBeTruthy();
  });
});
