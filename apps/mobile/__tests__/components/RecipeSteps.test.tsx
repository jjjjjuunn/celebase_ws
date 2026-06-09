// RecipeSteps — Recipe 탭 인라인 step view: counter·controlled current·Next/Prev·1-step Done·
// 마지막 Done→onDone·onExit·tips(step1·null). keep-awake/네비는 네이티브라 mock.

jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: (): boolean => true }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { RecipeSteps } from '../../src/components/RecipeSteps';
import { ThemeProvider } from '../../src/ui';

type Step = { step: number; text: string; duration_min: number | null };

const STEPS3: Step[] = [
  { step: 1, text: 'Boil the oats until creamy.', duration_min: 6 },
  { step: 2, text: 'Saute the zucchini until golden.', duration_min: 5 },
  { step: 3, text: 'Add egg whites and finish with lemon.', duration_min: null },
];
const STEP1: Step[] = [{ step: 1, text: 'Just mix everything together.', duration_min: null }];

interface HarnessProps {
  steps?: Step[];
  tips?: string | null;
  onDone?: () => void;
  onExit?: () => void;
}

// controlled current 를 부모처럼 관리(탭 왕복/네비 동기화 검증용).
function Harness({ steps = STEPS3, tips = null, onDone = jest.fn(), onExit = jest.fn() }: HarnessProps): React.JSX.Element {
  const [current, setCurrent] = useState(0);
  return (
    <ThemeProvider>
      <RecipeSteps
        steps={steps}
        tips={tips}
        height={600}
        current={current}
        onStepChange={setCurrent}
        onDone={onDone}
        onExit={onExit}
      />
    </ThemeProvider>
  );
}

describe('<RecipeSteps />', () => {
  it('counter + Next/Prev 이동(controlled current)', () => {
    render(<Harness />);
    expect(screen.getByText('STEP 1 OF 3')).toBeTruthy();
    expect(screen.getByText('Boil the oats until creamy.')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Next step'));
    expect(screen.getByText('STEP 2 OF 3')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Previous step'));
    expect(screen.getByText('STEP 1 OF 3')).toBeTruthy();
  });

  it('마지막 스텝: Done → onDone (Next 아님)', () => {
    const onDone = jest.fn();
    render(<Harness onDone={onDone} />);

    fireEvent.press(screen.getByLabelText('Next step'));
    fireEvent.press(screen.getByLabelText('Next step')); // → step 3 (last)
    expect(screen.getByText('STEP 3 OF 3')).toBeTruthy();
    expect(screen.queryByLabelText('Next step')).toBeNull();

    fireEvent.press(screen.getByLabelText('Done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('1-step: Prev 부재 + Done 만(Next 없음)', () => {
    const onDone = jest.fn();
    render(<Harness steps={STEP1} onDone={onDone} />);

    expect(screen.getByText('STEP 1 OF 1')).toBeTruthy();
    expect(screen.queryByLabelText('Previous step')).toBeNull();
    expect(screen.queryByLabelText('Next step')).toBeNull();

    fireEvent.press(screen.getByLabelText('Done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('헤더 back → onExit', () => {
    const onExit = jest.fn();
    render(<Harness onExit={onExit} />);
    fireEvent.press(screen.getByLabelText('Exit step view'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('tips 있으면 첫 스텝에 Pro tip', () => {
    render(<Harness tips="Use white miso for a milder flavor." />);
    expect(screen.getByText('Pro tip · Use white miso for a milder flavor.')).toBeTruthy();
  });

  it('tips null → Pro tip 미노출(회귀 가드 — 시드 다수 누락)', () => {
    render(<Harness tips={null} />);
    expect(screen.getByText('Boil the oats until creamy.')).toBeTruthy();
    expect(screen.queryByText(/Pro tip/)).toBeNull();
  });
});
