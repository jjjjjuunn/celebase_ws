// MealPlanGenerateSheet — 생성 체인(diet 해석→generate→poll) + 에러 분류 + 기간 pill 검증.
// 실제 서비스 경로를 태우고 globalThis.fetch 만 method+url 로 라우팅한다.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { MealPlanGenerateSheet } from '../../src/components/MealPlanGenerateSheet';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';

const PLAN_ID = '01927000-0000-7000-8000-000000000010';
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

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const GENERATE_ACCEPT = {
  id: PLAN_ID,
  status: 'queued' as const,
  estimated_completion_sec: 30,
  poll_url: `/meal-plans/${PLAN_ID}`,
  ws_channel: `mealplan:${PLAN_ID}`,
};

function planDetail(status: string): Record<string, unknown> {
  return { id: PLAN_ID, status, daily_plans: [] };
}

interface RouteConfig {
  diets?: unknown[];
  generate?: { status: number; body: unknown };
  poll?: { status: number; body: unknown };
}

function routeFetch(fetchSpy: jest.SpyInstance, cfg: RouteConfig): void {
  const diets = cfg.diets ?? [BASE_DIET];
  const generate = cfg.generate ?? { status: 201, body: GENERATE_ACCEPT };
  const poll = cfg.poll ?? { status: 200, body: planDetail('active') };

  fetchSpy.mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url.includes('/api/celebrities/') && url.endsWith('/diets')) {
      return Promise.resolve(makeResponse(200, { diets }));
    }
    if (url.includes('/api/celebrities')) {
      return Promise.resolve(
        makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
      );
    }
    if (method === 'POST' && url.endsWith('/api/meal-plans')) {
      return Promise.resolve(makeResponse(generate.status, generate.body));
    }
    if (method === 'GET' && url.includes('/api/meal-plans/')) {
      return Promise.resolve(makeResponse(poll.status, poll.body));
    }
    return Promise.reject(new Error(`unmocked ${method} ${url}`));
  });
}

describe('<MealPlanGenerateSheet />', () => {
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

  it('maxDays=3 → 기간 pill 1·2·3 만 노출', async () => {
    routeFetch(fetchSpy, {});
    render(<MealPlanGenerateSheet visible maxDays={3} onClose={jest.fn()} onGenerated={jest.fn()} />);

    expect(await screen.findByLabelText('1일')).toBeTruthy();
    expect(screen.getByLabelText('2일')).toBeTruthy();
    expect(screen.getByLabelText('3일')).toBeTruthy();
    expect(screen.queryByLabelText('4일')).toBeNull();
  });

  it('happy path: 셀럽 선택 → 2일 → 생성 → poll active → onGenerated(planId)', async () => {
    routeFetch(fetchSpy, {});
    const onGenerated = jest.fn();
    render(<MealPlanGenerateSheet visible maxDays={7} onClose={jest.fn()} onGenerated={onGenerated} />);

    fireEvent.press(await screen.findByLabelText('Select Beyoncé'));
    fireEvent.press(screen.getByLabelText('2일'));
    fireEvent.press(screen.getByLabelText('Generate plan'));

    await waitFor(() => {
      expect(onGenerated).toHaveBeenCalledWith(PLAN_ID);
    });
  });

  it('generate 429 → 크레딧 부족 에러, onGenerated 호출 안 함', async () => {
    routeFetch(fetchSpy, {
      generate: { status: 429, body: { error: { code: 'PLAN_LIMIT_REACHED', message: 'no credits' } } },
    });
    const onGenerated = jest.fn();
    render(<MealPlanGenerateSheet visible maxDays={7} onClose={jest.fn()} onGenerated={onGenerated} />);

    fireEvent.press(await screen.findByLabelText('Select Beyoncé'));
    fireEvent.press(screen.getByLabelText('Generate plan'));

    expect(await screen.findByText(/크레딧이 부족/)).toBeTruthy();
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('poll 결과 failed → 환불 안내 에러', async () => {
    routeFetch(fetchSpy, { poll: { status: 200, body: planDetail('failed') } });
    render(<MealPlanGenerateSheet visible maxDays={7} onClose={jest.fn()} onGenerated={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('Select Beyoncé'));
    fireEvent.press(screen.getByLabelText('Generate plan'));

    expect(await screen.findByText(/환불/)).toBeTruthy();
  });

  it('셀럽에 base_diet 없음 → 식단 데이터 없음 에러', async () => {
    routeFetch(fetchSpy, { diets: [] });
    render(<MealPlanGenerateSheet visible maxDays={7} onClose={jest.fn()} onGenerated={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('Select Beyoncé'));
    fireEvent.press(screen.getByLabelText('Generate plan'));

    expect(await screen.findByText(/식단 데이터가 없어요/)).toBeTruthy();
  });

  it('maxDays 축소 시 days clamp — effectiveMax 초과 days 유지 안 함', async () => {
    routeFetch(fetchSpy, {});
    const { rerender } = render(
      <MealPlanGenerateSheet visible maxDays={7} onClose={jest.fn()} onGenerated={jest.fn()} />,
    );

    fireEvent.press(await screen.findByLabelText('Select Beyoncé'));
    fireEvent.press(screen.getByLabelText('5일'));
    expect(screen.getByText('5일 = 5 크레딧 사용')).toBeTruthy();

    // 잔여 크레딧이 2로 줄어든 채 시트가 열려 있는 상황 (visible 유지 → 리셋 안 됨).
    rerender(
      <MealPlanGenerateSheet visible maxDays={2} onClose={jest.fn()} onGenerated={jest.fn()} />,
    );

    expect(screen.queryByLabelText('5일')).toBeNull();
    expect(screen.getByText('2일 = 2 크레딧 사용')).toBeTruthy();
  });

  it('생성 중 시트 닫힘 → in-flight 결과(onGenerated) 적용 안 됨', async () => {
    // generate POST 응답을 수동으로 붙잡아 in-flight 상태를 만든다 (holder 객체로 캡처).
    const deferred: { resolve: ((r: Response) => void) | null } = { resolve: null };
    fetchSpy.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.includes('/api/celebrities/') && url.endsWith('/diets')) {
        return Promise.resolve(makeResponse(200, { diets: [BASE_DIET] }));
      }
      if (url.includes('/api/celebrities')) {
        return Promise.resolve(
          makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
        );
      }
      if (method === 'POST' && url.endsWith('/api/meal-plans')) {
        return new Promise<Response>((res) => {
          deferred.resolve = res;
        });
      }
      return Promise.reject(new Error(`unmocked ${method} ${url}`));
    });
    const onGenerated = jest.fn();
    const { rerender } = render(
      <MealPlanGenerateSheet visible maxDays={7} onClose={jest.fn()} onGenerated={onGenerated} />,
    );

    fireEvent.press(await screen.findByLabelText('Select Beyoncé'));
    fireEvent.press(screen.getByLabelText('Generate plan'));

    // diet 해석 통과 후 generate POST 가 in-flight 가 될 때까지 대기.
    await waitFor(() => {
      expect(deferred.resolve).not.toBeNull();
    });

    // 사용자가 생성 도중 시트를 닫는다 (visible=false → runId 무효화).
    rerender(
      <MealPlanGenerateSheet
        visible={false}
        maxDays={7}
        onClose={jest.fn()}
        onGenerated={onGenerated}
      />,
    );

    // 뒤늦게 서버 응답이 도착해도 stale run 이라 onGenerated 가 호출되면 안 된다.
    deferred.resolve?.(makeResponse(201, GENERATE_ACCEPT));
    await new Promise((r) => setTimeout(r, 50));

    expect(onGenerated).not.toHaveBeenCalled();
  });
});
