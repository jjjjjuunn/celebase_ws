import { render, screen, fireEvent } from '@testing-library/react-native';

import { SelectionScreen } from '../../src/screens/SelectionScreen';
import { ThemeProvider } from '../../src/ui';

function renderScreen(props: { onPersonalized: () => void; onTrendOnly: () => void }): void {
  render(
    <ThemeProvider>
      <SelectionScreen {...props} />
    </ThemeProvider>,
  );
}

describe('SelectionScreen', () => {
  it('renders both path choices', () => {
    renderScreen({ onPersonalized: jest.fn(), onTrendOnly: jest.fn() });
    expect(screen.getByTestId('selection-personalized')).toBeTruthy();
    expect(screen.getByTestId('selection-trend-only')).toBeTruthy();
  });

  it('fires onPersonalized only when the personalized card is pressed', () => {
    const onPersonalized = jest.fn();
    const onTrendOnly = jest.fn();
    renderScreen({ onPersonalized, onTrendOnly });
    fireEvent.press(screen.getByTestId('selection-personalized'));
    expect(onPersonalized).toHaveBeenCalledTimes(1);
    expect(onTrendOnly).not.toHaveBeenCalled();
  });

  it('fires onTrendOnly only when the trend-only card is pressed', () => {
    const onPersonalized = jest.fn();
    const onTrendOnly = jest.fn();
    renderScreen({ onPersonalized, onTrendOnly });
    fireEvent.press(screen.getByTestId('selection-trend-only'));
    expect(onTrendOnly).toHaveBeenCalledTimes(1);
    expect(onPersonalized).not.toHaveBeenCalled();
  });
});
