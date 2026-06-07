// MealPlanScreen — 뉴스-우선 페이오프 화면: 온보딩 게이트 + plan 기간 날짜 스트립 +
// 1줄 영양 요약(Inspired by) + 끼니 섹션 리스트 + '+'/빈상태 → News 퍼널 + focusPlanId 착지.
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

// Screen consumes useTheme() — every render must be inside ThemeProvider.
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

// 날짜 스트립 기본 선택일 = 오늘. plan 의 날짜를 "오늘"로 맞춰야 끼니가 즉시 노출된다.
function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const todayISO = (): string => isoOffset(0);
const tomorrowISO = (): string => isoOffset(1);

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

// 내일 시작 plan — focusPlanId 착지(비-오늘 선택) 검증용.
const PLAN_TOMORROW = {
  ...PLAN,
  id: '01927000-0000-7000-8000-000000000011',
  start_date: tomorrowISO(),
  end_date: tomorrowISO(),
  daily_plans: [{ ...PLAN.daily_plans[0], date: tomorrowISO() }],
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
  /** base_diet 조인 실패(404) 시뮬레이션 — Inspired-by attribution 미렌더 회귀 가드용. */
  baseDietStatus?: number;
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
      return Promise.resolve(
        (routes.baseDietStatus ?? 200) === 404
          ? makeResponse(404, { error: { code: 'NOT_FOUND', message: 'no base diet' } })
          : makeResponse(200, { base_diet: BASE_DIET }),
      );
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
      <MealPlanScreen onNavigateOnboarding={onNavigateOnboarding} onNavigateNews={jest.fn()} />,
    );

    fireEvent.press(await screen.findByLabelText('온보딩하고 크레딧 3개 받기'));
    expect(onNavigateOnboarding).toHaveBeenCalledTimes(1);
  });

  it('온보딩 + plan 있는 날 → 크레딧 뱃지 + 영양 요약(Inspired by) + 끼니 카드', async () => {
    routeScreen(fetchSpy, { credits: () => CREDITS_PREMIUM, plans: [PLAN] });

    renderScreen(<MealPlanScreen onNavigateOnboarding={jest.fn()} onNavigateNews={jest.fn()} />);

    // 헤더: '+'(News 퍼널) + compact 크레딧 뱃지(tier · 잔량).
    expect(await screen.findByLabelText('Make a meal plan from News')).toBeTruthy();
    expect(screen.getByText('PREMIUM · 14')).toBeTruthy();
    // 끼니 카드: recipe 제목 로컬 조인 + kcal·시간 + overview. placeholder('Recipe #...') 아님.
    expect((await screen.findAllByText('Greek Yogurt Power Bowl')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Recipe #/)).toBeNull();
    expect(screen.getByText('420 kcal · 5 min')).toBeTruthy();
    expect(screen.getByText('Greek yogurt with honey')).toBeTruthy();
    // 1줄 영양 요약: 오늘 라벨 + daily_totals kcal(실제 합산) + 유저 macro%.
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('1,800 kcal')).toBeTruthy();
    expect(screen.getByText('P 28 · C 41 · F 31')).toBeTruthy();
    // 셀럽/다이어트 attribution.
    expect(await screen.findByText(/Inspired by Beyoncé/)).toBeTruthy();
  });

  it('끼니 섹션 — 끼니 있는 슬롯만 헤더 렌더(좌측 rail 제거 회귀 가드)', async () => {
    routeScreen(fetchSpy, { credits: () => CREDITS_PREMIUM, plans: [PLAN] });

    renderScreen(<MealPlanScreen onNavigateOnboarding={jest.fn()} onNavigateNews={jest.fn()} />);

    // PLAN 은 breakfast 끼니만 → BREAKFAST 섹션 헤더만, 나머지 슬롯은 미렌더.
    expect(await screen.findByText('BREAKFAST')).toBeTruthy();
    expect(screen.queryByText('LUNCH')).toBeNull();
    expect(screen.queryByText('SNACK')).toBeNull();
    expect(screen.queryByText('DINNER')).toBeNull();
  });

  it('base_diet 조인 실패 → Inspired-by attribution 미렌더(회귀 가드), 끼니는 유지', async () => {
    routeScreen(fetchSpy, { credits: () => CREDITS_PREMIUM, plans: [PLAN], baseDietStatus: 404 });

    renderScreen(<MealPlanScreen onNavigateOnboarding={jest.fn()} onNavigateNews={jest.fn()} />);

    // 끼니/요약은 plan.daily_plans 에서 직접 오므로 렌더(attribution 비의존).
    await screen.findByText('420 kcal · 5 min');
    expect(screen.getByText('1,800 kcal')).toBeTruthy();
    // base_diet 조인 실패 → celeb/diet 이름 없음 → Inspired-by 줄 미렌더.
    expect(screen.queryByText(/Inspired by/)).toBeNull();
  });

  it("빈상태/'+' → News 퍼널 (무크레딧 paywall dead-end 없음)", async () => {
    routeScreen(fetchSpy, { credits: () => CREDITS_FREE_EMPTY, plans: [] });
    const onNavigateNews = jest.fn();

    renderScreen(
      <MealPlanScreen onNavigateOnboarding={jest.fn()} onNavigateNews={onNavigateNews} />,
    );

    // 오늘 plan 없음 → 빈상태 CTA → News.
    fireEvent.press(await screen.findByText('News 에서 식단 만들기'));
    expect(onNavigateNews).toHaveBeenCalledTimes(1);

    // 헤더 '+' 도 News 로 (셀럽 grid 시트 없음).
    fireEvent.press(screen.getByLabelText('Make a meal plan from News'));
    expect(onNavigateNews).toHaveBeenCalledTimes(2);
  });

  it('focusPlanId → 새 plan 의 start_date(내일) 선택 후 그 날 끼니 노출', async () => {
    routeScreen(fetchSpy, { credits: () => CREDITS_PREMIUM, plans: [PLAN_TOMORROW] });

    renderScreen(
      <MealPlanScreen
        onNavigateOnboarding={jest.fn()}
        onNavigateNews={jest.fn()}
        focusPlanId={PLAN_TOMORROW.id}
      />,
    );

    // 기본 선택=오늘(plan 없음)이지만 focusPlanId 가 내일을 선택 → 끼니 노출.
    expect((await screen.findAllByText('Greek Yogurt Power Bowl')).length).toBeGreaterThan(0);
  });

  it('reloadKey 변경(focus refresh) → plans 재fetch 반영(빈→끼니)', async () => {
    const plansState: unknown[] = [];
    routeScreen(fetchSpy, { credits: () => CREDITS_PREMIUM, plans: plansState });

    const { rerender } = renderScreen(
      <MealPlanScreen onNavigateOnboarding={jest.fn()} onNavigateNews={jest.fn()} reloadKey={0} />,
    );

    // 초기: plan 없음 → 빈상태 CTA.
    expect(await screen.findByText('News 에서 식단 만들기')).toBeTruthy();

    // 식단 생성 후 focus → reloadKey 증가 → 재fetch 시 plan 노출(같은 배열 ref 변형).
    plansState.push(PLAN);
    rerender(
      <ThemeProvider>
        <MealPlanScreen onNavigateOnboarding={jest.fn()} onNavigateNews={jest.fn()} reloadKey={1} />
      </ThemeProvider>,
    );

    expect((await screen.findAllByText('Greek Yogurt Power Bowl')).length).toBeGreaterThan(0);
  });
});
