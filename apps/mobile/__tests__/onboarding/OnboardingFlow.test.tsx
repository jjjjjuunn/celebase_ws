jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { OnboardingFlow } from '../../src/onboarding/OnboardingFlow';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';

const CELEB = {
  id: '018d1a6a-0000-7000-8000-000000000040',
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

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockCelebrities(fetchSpy: jest.SpyInstance): void {
  fetchSpy.mockResolvedValueOnce(
    makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
  );
}

// S2 → S5 진입까지 진행. happy path 테스트의 공용 도구.
function advanceThroughS2toS4(): void {
  fireEvent.press(screen.getByLabelText('Beyoncé 선택'));
  fireEvent.press(screen.getByLabelText('다음 단계로'));
  fireEvent.changeText(screen.getByLabelText('이름'), '도현');
  fireEvent.changeText(screen.getByLabelText('출생 연도'), '1995');
  fireEvent.press(screen.getByLabelText('남성'));
  fireEvent.press(screen.getByLabelText('다음 단계로'));
  fireEvent.changeText(screen.getByLabelText('키'), '170');
  fireEvent.changeText(screen.getByLabelText('몸무게'), '65');
  fireEvent.press(screen.getByLabelText('입력 완료'));
}

describe('<OnboardingFlow /> S2~S4 기본 흐름', () => {
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

  it('S2 셀럽 그리드 로드 → 카드 노출', async () => {
    mockCelebrities(fetchSpy);

    render(<OnboardingFlow onDone={jest.fn()} onClose={jest.fn()} />);

    expect(await screen.findByLabelText('Beyoncé 선택')).toBeTruthy();
  });

  it('S2~S4 통과 → S5 (활동량 화면) 렌더', async () => {
    mockCelebrities(fetchSpy);

    render(<OnboardingFlow onDone={jest.fn()} onClose={jest.fn()} />);
    await screen.findByLabelText('Beyoncé 선택');

    advanceThroughS2toS4();

    expect(await screen.findByText('활동량과 건강 정보')).toBeTruthy();
  });

  it('S3 빈 이름 → validation 에러, 진행 안 함', async () => {
    mockCelebrities(fetchSpy);

    render(<OnboardingFlow onDone={jest.fn()} onClose={jest.fn()} />);
    fireEvent.press(await screen.findByLabelText('Beyoncé 선택'));
    fireEvent.press(screen.getByLabelText('다음 단계로'));

    fireEvent.press(screen.getByLabelText('다음 단계로'));

    expect(screen.getByText('이름을 입력해주세요.')).toBeTruthy();
  });

  it('S4 키 범위 밖 → validation 에러', async () => {
    mockCelebrities(fetchSpy);

    render(<OnboardingFlow onDone={jest.fn()} onClose={jest.fn()} />);
    fireEvent.press(await screen.findByLabelText('Beyoncé 선택'));
    fireEvent.press(screen.getByLabelText('다음 단계로'));
    fireEvent.changeText(screen.getByLabelText('이름'), '도현');
    fireEvent.changeText(screen.getByLabelText('출생 연도'), '1995');
    fireEvent.press(screen.getByLabelText('여성'));
    fireEvent.press(screen.getByLabelText('다음 단계로'));

    fireEvent.changeText(screen.getByLabelText('키'), '50');
    fireEvent.changeText(screen.getByLabelText('몸무게'), '65');
    fireEvent.press(screen.getByLabelText('입력 완료'));

    expect(screen.getByText(/키는 100–250cm/)).toBeTruthy();
  });

  it('✕ 닫기 → onClose 콜백', async () => {
    mockCelebrities(fetchSpy);
    const onClose = jest.fn();

    render(<OnboardingFlow onDone={jest.fn()} onClose={onClose} />);
    await screen.findByLabelText('Beyoncé 선택');

    fireEvent.press(screen.getByLabelText('닫기'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('<OnboardingFlow /> S5~S7 PHI + 최종 POST', () => {
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

  it('S5 Health Disclaimer 노출 (accessibility role="alert")', async () => {
    mockCelebrities(fetchSpy);

    render(<OnboardingFlow onDone={jest.fn()} onClose={jest.fn()} />);
    await screen.findByLabelText('Beyoncé 선택');
    advanceThroughS2toS4();
    await screen.findByText('활동량과 건강 정보');

    expect(screen.getByLabelText('건강 정보 면책 안내')).toBeTruthy();
    expect(screen.getByText(/교육 목적으로 제공되며/)).toBeTruthy();
  });

  it('S5 activity_level 미선택 → validation 에러', async () => {
    mockCelebrities(fetchSpy);

    render(<OnboardingFlow onDone={jest.fn()} onClose={jest.fn()} />);
    await screen.findByLabelText('Beyoncé 선택');
    advanceThroughS2toS4();
    await screen.findByText('활동량과 건강 정보');

    fireEvent.press(screen.getByLabelText('다음 단계로'));

    expect(screen.getByText('활동량을 선택해주세요.')).toBeTruthy();
  });

  it('S6 primary_goal 미선택 → validation 에러', async () => {
    mockCelebrities(fetchSpy);

    render(<OnboardingFlow onDone={jest.fn()} onClose={jest.fn()} />);
    await screen.findByLabelText('Beyoncé 선택');
    advanceThroughS2toS4();
    await screen.findByText('활동량과 건강 정보');
    fireEvent.press(screen.getByLabelText('보통'));
    fireEvent.press(screen.getByLabelText('다음 단계로'));

    await screen.findByText('목표와 식단 선호');
    fireEvent.press(screen.getByLabelText('다음 단계로'));

    expect(screen.getByText('가장 중요한 목표 하나를 선택해주세요.')).toBeTruthy();
  });

  it('S2→S7 happy path: PHI 포함 단일 POST + onDone', async () => {
    const bioProfileBody = {
      bio_profile: {
        id: '01927000-0000-7000-8000-aaaaaaaaaaaa',
        user_id: '01927000-0000-7000-8000-bbbbbbbbbbbb',
        birth_year: 1995,
        sex: 'male',
        height_cm: 170,
        weight_kg: 65,
        waist_cm: null,
        body_fat_pct: null,
        activity_level: 'moderate',
        sleep_hours_avg: null,
        stress_level: null,
        allergies: ['땅콩'],
        intolerances: [],
        medical_conditions: ['고혈압'],
        medications: ['아스피린'],
        biomarkers: {},
        primary_goal: 'weight_loss',
        secondary_goals: [],
        diet_type: null,
        cuisine_preferences: [],
        disliked_ingredients: [],
        bmr_kcal: 1500,
        tdee_kcal: 2100,
        target_kcal: 1800,
        macro_targets: { protein_g: 130, carbs_g: 200, fat_g: 55 },
        version: 1,
        created_at: '2026-05-12T00:00:00.000Z',
        updated_at: '2026-05-12T00:00:00.000Z',
      },
    };

    // URL pattern 별 응답 매칭 (mockResolvedValueOnce chaining 대신, 순서/횟수 무관).
    fetchSpy.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/celebrities')) {
        return Promise.resolve(
          makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
        );
      }
      if (typeof url === 'string' && url.includes('/api/users/me/bio-profile')) {
        return Promise.resolve(makeResponse(201, bioProfileBody));
      }
      return Promise.reject(new Error(`Unmocked fetch: ${url}`));
    });

    const onDone = jest.fn();

    render(<OnboardingFlow onDone={onDone} onClose={jest.fn()} />);
    await screen.findByLabelText('Beyoncé 선택');
    advanceThroughS2toS4();

    // S5
    await screen.findByText('활동량과 건강 정보');
    fireEvent.press(screen.getByLabelText('보통'));
    fireEvent.press(screen.getByLabelText('땅콩'));
    fireEvent.changeText(screen.getByLabelText('의료 조건'), '고혈압');
    fireEvent.changeText(screen.getByLabelText('복용 중인 약'), '아스피린');
    fireEvent.press(screen.getByLabelText('다음 단계로'));

    // S6
    await screen.findByText('목표와 식단 선호');
    fireEvent.press(screen.getByLabelText('체중 감량'));
    fireEvent.press(screen.getByLabelText('다음 단계로'));

    // S7 — saveBioProfile POST 호출 후 success → onDone
    await screen.findByText('설정 완료!');
    fireEvent.press(screen.getByLabelText('홈으로'));

    expect(onDone).toHaveBeenCalledTimes(1);

    // POST body 검증: PHI 필드 (medical_conditions, medications) 포함, S2 의 persona slug 미포함.
    const calls = fetchSpy.mock.calls as Array<[string, RequestInit]>;
    const postCall = calls.find(
      ([url, init]) =>
        url.endsWith('/api/users/me/bio-profile') && init.method === 'POST',
    );
    expect(postCall).toBeDefined();
    if (postCall === undefined) return;
    const init = postCall[1];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.medical_conditions).toEqual(['고혈압']);
    expect(body.medications).toEqual(['아스피린']);
    expect(body.allergies).toEqual(['땅콩']);
    expect(body.activity_level).toBe('moderate');
    expect(body.primary_goal).toBe('weight_loss');
    expect(body.height_cm).toBe(170);
    expect(body.weight_kg).toBe(65);
    // persona slug 는 bio-profile body 에 절대 포함되지 않아야 한다 (별도 endpoint).
    expect(body.preferred_celebrity_slug).toBeUndefined();
  });

  it('S7 POST 5xx → 에러 화면 + 재시도 버튼', async () => {
    mockCelebrities(fetchSpy);
    fetchSpy.mockResolvedValueOnce(
      makeResponse(500, { error: { code: 'AUDIT_LOG_FAILURE', message: 'fail-closed' } }),
    );

    render(<OnboardingFlow onDone={jest.fn()} onClose={jest.fn()} />);
    await screen.findByLabelText('Beyoncé 선택');
    advanceThroughS2toS4();
    await screen.findByText('활동량과 건강 정보');
    fireEvent.press(screen.getByLabelText('보통'));
    fireEvent.press(screen.getByLabelText('다음 단계로'));
    await screen.findByText('목표와 식단 선호');
    fireEvent.press(screen.getByLabelText('체중 감량'));
    fireEvent.press(screen.getByLabelText('다음 단계로'));

    await waitFor(() => {
      expect(screen.getByText('저장 실패')).toBeTruthy();
    });
    expect(screen.getByText(/저장에 실패했습니다/)).toBeTruthy();
    expect(screen.getByLabelText('다시 시도')).toBeTruthy();
  });
});
