// MealPlanScreen integration — 4 phase (loading/empty/loaded/error) 검증.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { render, screen } from '@testing-library/react-native';

import { MealPlanScreen } from '../../src/screens/MealPlanScreen';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';

const PLAN_WITH_MEALS = {
  id: '01927000-0000-7000-8000-000000000010',
  user_id: '01927000-0000-7000-8000-000000000001',
  base_diet_id: '01927000-0000-7000-8000-000000000020',
  name: 'Inspired Mediterranean',
  status: 'active' as const,
  adjustments: {},
  start_date: '2026-05-13',
  end_date: '2026-05-19',
  daily_plans: [
    {
      day: 1,
      date: '2026-05-13',
      meals: [
        {
          meal_type: 'breakfast',
          recipe_id: '01927000-0000-7000-8000-000000000100',
          adjusted_nutrition: { calories: 420, protein_g: 28, carbs_g: 38, fat_g: 16 },
          narrative: 'Greek yogurt with honey + walnuts.',
        },
        {
          meal_type: 'lunch',
          recipe_id: '01927000-0000-7000-8000-000000000101',
          adjusted_nutrition: { calories: 620, protein_g: 42, carbs_g: 55, fat_g: 22 },
          narrative: 'Grilled salmon over quinoa salad.',
        },
      ],
      daily_totals: { calories: 1800, protein_g: 120, carbs_g: 180, fat_g: 60 },
    },
  ],
  created_at: '2026-05-13T00:00:00.000Z',
  updated_at: '2026-05-13T00:00:00.000Z',
  deleted_at: null,
};

const PLAN_EMPTY_DAYS = {
  ...PLAN_WITH_MEALS,
  id: '01927000-0000-7000-8000-000000000011',
  daily_plans: [],
};

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('<MealPlanScreen />', () => {
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

  it('plan list 비어있음 → empty state ("No plan yet")', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(200, { items: [], next_cursor: null, has_next: false }),
    );

    render(<MealPlanScreen />);

    expect(await screen.findByText('No plan yet')).toBeTruthy();
  });

  it('active plan 로드 → 이름 + 날짜 + 매크로 + meal 렌더', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(200, {
        items: [PLAN_WITH_MEALS],
        next_cursor: null,
        has_next: false,
      }),
    );

    render(<MealPlanScreen />);

    expect(await screen.findByText('Inspired Mediterranean')).toBeTruthy();
    expect(screen.getByText('2026-05-13 — 2026-05-19')).toBeTruthy();
    // daily_totals.calories = 1800
    expect(screen.getByText('1800')).toBeTruthy();
    // meal narratives
    expect(screen.getByText('Greek yogurt with honey + walnuts.')).toBeTruthy();
    expect(screen.getByText('Grilled salmon over quinoa salad.')).toBeTruthy();
    // meal_type capitalized
    expect(screen.getByText('Breakfast')).toBeTruthy();
    expect(screen.getByText('Lunch')).toBeTruthy();
  });

  it('plan 존재 + daily_plans 빈 배열 → "no daily meals" guard 메시지', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(200, {
        items: [PLAN_EMPTY_DAYS],
        next_cursor: null,
        has_next: false,
      }),
    );

    render(<MealPlanScreen />);

    expect(await screen.findByText('This plan has no daily meals yet.')).toBeTruthy();
  });

  it('fetch 실패 → error state', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(500, { error: { code: 'INTERNAL', message: 'boom' } }),
    );

    render(<MealPlanScreen />);

    expect(await screen.findByText("Couldn't load your plan.")).toBeTruthy();
  });

  it('active 상태가 없으면 list 첫 항목을 선택', async () => {
    const draftPlan = { ...PLAN_WITH_MEALS, status: 'draft' as const, name: 'Draft Plan' };
    fetchSpy.mockResolvedValue(
      makeResponse(200, {
        items: [draftPlan],
        next_cursor: null,
        has_next: false,
      }),
    );

    render(<MealPlanScreen />);

    expect(await screen.findByText('Draft Plan')).toBeTruthy();
  });
});
