// EmptyState primitive — replaces text-only "아직 ... 없어요" blocks. Centered
// glyph + title + body + optional CTA, so empty surfaces feel intentional.

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

interface EmptyStateProps {
  /** Emoji or short glyph shown above the title. */
  glyph?: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  onPressCta?: () => void;
}

export function EmptyState({
  glyph = '✨',
  title,
  body,
  ctaLabel,
  onPressCta,
}: EmptyStateProps): React.JSX.Element {
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.space(6),
          paddingVertical: theme.space(8),
          gap: theme.space(3),
        },
        glyph: { fontSize: 56 },
        cta: { marginTop: theme.space(2), alignSelf: 'stretch' },
      }),
    [theme],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.glyph}>{glyph}</Text>
      <Text variant="h3" center>
        {title}
      </Text>
      {body != null && body !== '' ? (
        <Text variant="body" tone="muted" center>
          {body}
        </Text>
      ) : null}
      {ctaLabel != null && ctaLabel !== '' && onPressCta ? (
        <View style={styles.cta}>
          <Button label={ctaLabel} onPress={onPressCta} />
        </View>
      ) : null}
    </View>
  );
}
