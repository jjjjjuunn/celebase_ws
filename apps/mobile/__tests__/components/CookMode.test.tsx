// CookMode — 한 스텝씩 전체화면 조리 모드: counter·Next/Prev·1-step Finish·재료 peek·a11y.
// keep-awake 는 네이티브라 mock(테스트 환경 no-op).

jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { CookMode } from '../../src/components/CookMode';
import { ThemeProvider } from '../../src/ui';

function renderCM(ui: ReactElement): ReturnType<typeof render> {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const STEPS3 = [
  { step: 1, text: 'Boil the oats until creamy.', duration_min: 6 },
  { step: 2, text: 'Saute the zucchini until golden.', duration_min: 5 },
  { step: 3, text: 'Add egg whites and finish with lemon.', duration_min: null },
];
const STEP1 = [{ step: 1, text: 'Just mix everything together.', duration_min: null }];
const INGREDIENTS = [
  { name: 'Rolled Oats', quantity: 0.5, unit: 'cup', preparation: null, is_optional: false },
  { name: 'Zucchini', quantity: 0.5, unit: 'medium', preparation: 'sliced', is_optional: false },
];

describe('<CookMode />', () => {
  it('다스텝: step counter + Next/Prev 이동', () => {
    renderCM(<CookMode visible onClose={jest.fn()} steps={STEPS3} ingredients={INGREDIENTS} />);
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    // paging — 전 스텝 동시 마운트(텍스트 모두 트리에 존재).
    expect(screen.getByText('Boil the oats until creamy.')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Next step'));
    expect(screen.getByText('Step 2 of 3')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Previous step'));
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
  });

  it('마지막 스텝: Finish 버튼 → onClose (Next 아님)', () => {
    const onClose = jest.fn();
    renderCM(<CookMode visible onClose={onClose} steps={STEPS3} ingredients={INGREDIENTS} />);

    fireEvent.press(screen.getByLabelText('Next step'));
    fireEvent.press(screen.getByLabelText('Next step')); // → step 3 (last)
    expect(screen.getByText('Step 3 of 3')).toBeTruthy();
    expect(screen.queryByLabelText('Next step')).toBeNull();

    fireEvent.press(screen.getByLabelText('Finish'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('1-step: Prev 부재 + Finish 만 (Next 없음)', () => {
    const onClose = jest.fn();
    renderCM(<CookMode visible onClose={onClose} steps={STEP1} ingredients={INGREDIENTS} />);

    expect(screen.getByText('Step 1 of 1')).toBeTruthy();
    expect(screen.queryByLabelText('Previous step')).toBeNull();
    expect(screen.queryByLabelText('Next step')).toBeNull();

    fireEvent.press(screen.getByLabelText('Finish'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Ingredients peek 토글 + preparation 표기', () => {
    renderCM(<CookMode visible onClose={jest.fn()} steps={STEPS3} ingredients={INGREDIENTS} />);

    // 기본은 닫힘.
    expect(screen.queryByText('Rolled Oats (0.5 cup)')).toBeNull();

    fireEvent.press(screen.getByLabelText('Show ingredients'));
    expect(screen.getByText('Rolled Oats (0.5 cup)')).toBeTruthy();
    expect(screen.getByText('Zucchini (0.5 medium · sliced)')).toBeTruthy();

    // pill 라벨이 'Hide ingredients' 로 토글 → 닫기.
    fireEvent.press(screen.getByLabelText('Hide ingredients'));
    expect(screen.queryByText('Rolled Oats (0.5 cup)')).toBeNull();
  });

  it('visible=false → 콘텐츠 미렌더 (keep-awake 미마운트)', () => {
    renderCM(<CookMode visible={false} onClose={jest.fn()} steps={STEPS3} ingredients={INGREDIENTS} />);
    expect(screen.queryByText('Step 1 of 3')).toBeNull();
  });
});
