// Badge primitive — small pill for tier / category / status labels.

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export type BadgeTone = 'brand' | 'subtle' | 'neutral';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

export function Badge({ label, tone = 'brand' }: BadgeProps): React.JSX.Element {
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        base: {
          alignSelf: 'flex-start',
          paddingHorizontal: theme.space(3),
          paddingVertical: theme.space(1),
          borderRadius: theme.radius.pill,
        },
        brand: { backgroundColor: theme.color.brand },
        subtle: { backgroundColor: theme.color.brandSubtle },
        neutral: { backgroundColor: theme.color.surface },
      }),
    [theme],
  );

  const textTone = tone === 'brand' ? 'onBrand' : tone === 'subtle' ? 'brand' : 'muted';

  return (
    <View style={[styles.base, styles[tone]]}>
      <Text variant="label" tone={textTone}>
        {label}
      </Text>
    </View>
  );
}
