// CelebrityDetailScreen — mock-data profile render (IMPL-MOBILE-CELEB-DETAIL-FIX-001).
// 더 이상 실 API 를 호출하지 않으므로 fetch mock 불필요. slug → getMockCelebrityBySlug.

import { fireEvent, render, screen } from '@testing-library/react-native';

import { CelebrityDetailScreen } from '../../src/screens/CelebrityDetailScreen';
import { ThemeProvider } from '../../src/ui';

function renderScreen(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('<CelebrityDetailScreen />', () => {
  it('알려진 slug → 프로필(이름·매크로·철학) 렌더', () => {
    renderScreen(<CelebrityDetailScreen slug="gwyneth-paltrow" onBack={jest.fn()} />);

    expect(screen.getByText('Gwyneth Paltrow')).toBeTruthy();
    expect(screen.getByText('Daily macros')).toBeTruthy();
    expect(screen.getByText('88g')).toBeTruthy(); // protein macro
    expect(screen.getByText(/paleo-leaning/i)).toBeTruthy(); // philosophy snippet
  });

  it('운동 루틴 있는 셀럽 → Training 섹션 노출', () => {
    renderScreen(<CelebrityDetailScreen slug="gwyneth-paltrow" onBack={jest.fn()} />);
    expect(screen.getByText('Training')).toBeTruthy();
  });

  it('없는 slug → not found empty state', () => {
    renderScreen(<CelebrityDetailScreen slug="does-not-exist" onBack={jest.fn()} />);
    expect(screen.getByText('Celebrity not found')).toBeTruthy();
  });

  it('Back → onBack 호출', () => {
    const onBack = jest.fn();
    renderScreen(<CelebrityDetailScreen slug="gwyneth-paltrow" onBack={onBack} />);
    fireEvent.press(screen.getByTestId('celebrity-detail-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
