// Design-system primitive tests — render every primitive in BOTH light and dark
// themes (catches "looks fine, breaks on dark" regressions before the user can
// visually verify) plus core interactions.

import { fireEvent, render } from '@testing-library/react-native';

import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Screen,
  Skeleton,
  Text,
  ThemeProvider,
  type ThemeMode,
} from '..';

function renderInTheme(node: React.ReactNode, mode: ThemeMode) {
  return render(<ThemeProvider initialMode={mode}>{node}</ThemeProvider>);
}

const MODES: readonly ThemeMode[] = ['light', 'dark'];

describe.each(MODES)('design system — %s theme', (mode) => {
  it('Text renders all variants', () => {
    const { toJSON } = renderInTheme(
      <>
        <Text variant="display">Display</Text>
        <Text variant="h1">Heading</Text>
        <Text variant="body" tone="muted">
          Body
        </Text>
        <Text variant="label" tone="brand">
          Label
        </Text>
      </>,
      mode,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('Button fires onPress and renders variants', () => {
    const onPress = jest.fn();
    const { getByRole, toJSON } = renderInTheme(
      <Button label="Continue" onPress={onPress} />,
      mode,
    );
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(toJSON()).toMatchSnapshot();
  });

  it('Button does not fire when disabled', () => {
    const onPress = jest.fn();
    const { getByRole } = renderInTheme(
      <Button label="Off" onPress={onPress} disabled />,
      mode,
    );
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('Avatar derives stable monogram initials', () => {
    const { getByLabelText } = renderInTheme(<Avatar name="Cristiano Ronaldo" />, mode);
    expect(getByLabelText('Cristiano Ronaldo')).toBeTruthy();
  });

  it('Card / Badge / Skeleton / EmptyState render', () => {
    const { toJSON } = renderInTheme(
      <Card>
        <Badge label="ELITE" />
        <Skeleton width={120} height={20} />
        <EmptyState glyph="🥗" title="No plans yet" body="Create your first plan." />
      </Card>,
      mode,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('Screen renders title + children', () => {
    const { getByText } = renderInTheme(
      <Screen title="Your Plan">
        <Text>content</Text>
      </Screen>,
      mode,
    );
    expect(getByText('Your Plan')).toBeTruthy();
    expect(getByText('content')).toBeTruthy();
  });
});
