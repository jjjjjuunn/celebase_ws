jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';

import { OnboardingFlow } from '../../src/onboarding/OnboardingFlow';
import type { OnboardingDraftS2S4 } from '../../src/onboarding/types';
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

describe('<OnboardingFlow /> S2~S4', () => {
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
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
    );

    render(<OnboardingFlow onComplete={jest.fn()} onClose={jest.fn()} />);

    expect(await screen.findByLabelText('Beyoncé 선택')).toBeTruthy();
  });

  it('S2 → S3 → S4 → onComplete 호출 (행복 경로)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
    );
    const onComplete = jest.fn();
    const onClose = jest.fn();

    render(<OnboardingFlow onComplete={onComplete} onClose={onClose} />);

    // S2: 셀럽 선택 → 다음
    fireEvent.press(await screen.findByLabelText('Beyoncé 선택'));
    fireEvent.press(screen.getByLabelText('다음 단계로'));

    // S3: 이름 + 생년 + 성별 입력
    fireEvent.changeText(screen.getByLabelText('이름'), '도현');
    fireEvent.changeText(screen.getByLabelText('출생 연도'), '1995');
    fireEvent.press(screen.getByLabelText('남성'));
    fireEvent.press(screen.getByLabelText('다음 단계로'));

    // S4: 키/몸무게 입력 → 완료
    fireEvent.changeText(screen.getByLabelText('키'), '170');
    fireEvent.changeText(screen.getByLabelText('몸무게'), '65');
    fireEvent.press(screen.getByLabelText('입력 완료'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const draft = (onComplete.mock.calls[0] as [OnboardingDraftS2S4])[0];
    expect(draft).toEqual({
      persona: { preferred_celebrity_slug: 'beyonce' },
      basicInfo: { display_name: '도현', birth_year: 1995, sex: 'male' },
      bodyMetrics: { height_cm: 170, weight_kg: 65 },
    });
  });

  it('S3 빈 이름 → validation 에러, 진행 안 함', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
    );
    const onComplete = jest.fn();

    render(<OnboardingFlow onComplete={onComplete} onClose={jest.fn()} />);
    fireEvent.press(await screen.findByLabelText('Beyoncé 선택'));
    fireEvent.press(screen.getByLabelText('다음 단계로'));

    // 빈 채로 다음
    fireEvent.press(screen.getByLabelText('다음 단계로'));

    expect(screen.getByText('이름을 입력해주세요.')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('S4 키 범위 밖 → validation 에러, 진행 안 함', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
    );
    const onComplete = jest.fn();

    render(<OnboardingFlow onComplete={onComplete} onClose={jest.fn()} />);
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
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('✕ 닫기 → onClose 콜백 (어느 단계에서든)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
    );
    const onClose = jest.fn();

    render(<OnboardingFlow onComplete={jest.fn()} onClose={onClose} />);
    await screen.findByLabelText('Beyoncé 선택');

    fireEvent.press(screen.getByLabelText('닫기'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('S3 → S2 뒤로 → 셀럽 선택 유지', async () => {
    // S2 가 remount 되면 useEffect 가 다시 fetch — 두 번 mock 필요.
    fetchSpy
      .mockResolvedValueOnce(
        makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
      )
      .mockResolvedValueOnce(
        makeResponse(200, { items: [CELEB], next_cursor: null, has_next: false }),
      );

    render(<OnboardingFlow onComplete={jest.fn()} onClose={jest.fn()} />);
    fireEvent.press(await screen.findByLabelText('Beyoncé 선택'));
    fireEvent.press(screen.getByLabelText('다음 단계로'));

    fireEvent.press(screen.getByLabelText('이전 단계'));

    // 다시 S2, fetch 끝난 후 카드의 selected 유지 (initial prop 으로 복원)
    await screen.findByLabelText('Beyoncé 선택');
    const card = screen.getByLabelText('Beyoncé 선택') as unknown as {
      props: { accessibilityState?: { selected?: boolean } };
    };
    expect(card.props.accessibilityState?.selected).toBe(true);
  });
});
