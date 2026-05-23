// Typography primitive. Variants map to the token type scale; display/heading
// variants use the Fraunces serif (theme.font.display), body variants use Plus
// Jakarta Sans. Until those fonts are loaded (see ui/README morning step) RN
// falls back to the system font — no crash, just no premium face yet.

import { useMemo } from 'react';
import { StyleSheet, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from './ThemeProvider';

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'body'
  | 'bodyLg'
  | 'bodySm'
  | 'caption'
  | 'label'
  | 'metricXl'
  | 'metricLg'
  | 'metricMd'
  | 'metricSm';

export type TextTone = 'default' | 'muted' | 'subtle' | 'brand' | 'onBrand' | 'error';

interface AppTextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  center?: boolean;
  children: React.ReactNode;
}

export function Text({
  variant = 'body',
  tone = 'default',
  center = false,
  style,
  children,
  ...rest
}: AppTextProps): React.JSX.Element {
  const theme = useTheme();

  const { variants, tones } = useMemo(() => {
    const display = { fontFamily: theme.font.display, color: theme.color.text };
    const body = { fontFamily: theme.font.body, color: theme.color.text };
    // JetBrains Mono numerals — tabular digits keep columns/animated counters from
    // jittering. Numbers only (kcal, %, credits, dates), never body copy.
    const tabular = ['tabular-nums'] as TextStyle['fontVariant'];
    const mono = { fontFamily: theme.font.mono, color: theme.color.text, fontVariant: tabular };
    return {
      variants: StyleSheet.create({
        display: { ...display, fontSize: theme.type.display, fontWeight: theme.weight.bold, lineHeight: theme.type.display * 1.1 },
        h1: { ...display, fontSize: theme.type.h1, fontWeight: theme.weight.bold, lineHeight: theme.type.h1 * 1.15 },
        h2: { ...display, fontSize: theme.type.h2, fontWeight: theme.weight.semibold, lineHeight: theme.type.h2 * 1.2 },
        h3: { ...body, fontSize: theme.type.h3, fontWeight: theme.weight.semibold, lineHeight: theme.type.h3 * 1.25 },
        h4: { ...body, fontSize: theme.type.h4, fontWeight: theme.weight.semibold, lineHeight: theme.type.h4 * 1.3 },
        bodyLg: { ...body, fontSize: theme.type.bodyLg, fontWeight: theme.weight.regular, lineHeight: theme.type.bodyLg * 1.5 },
        body: { ...body, fontSize: theme.type.body, fontWeight: theme.weight.regular, lineHeight: theme.type.body * 1.5 },
        bodySm: { ...body, fontSize: theme.type.bodySm, fontWeight: theme.weight.regular, lineHeight: theme.type.bodySm * 1.45 },
        caption: { ...body, fontSize: theme.type.caption, fontWeight: theme.weight.regular, lineHeight: theme.type.caption * 1.4 },
        label: {
          ...body,
          fontSize: theme.type.caption,
          fontWeight: theme.weight.semibold,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        },
        metricXl: { ...mono, fontSize: theme.type.metricXl, fontWeight: theme.weight.semibold, lineHeight: theme.type.metricXl, letterSpacing: -0.5 },
        metricLg: { ...mono, fontSize: theme.type.metricLg, fontWeight: theme.weight.semibold, lineHeight: theme.type.metricLg, letterSpacing: -0.3 },
        metricMd: { ...mono, fontSize: theme.type.metricMd, fontWeight: theme.weight.medium, lineHeight: theme.type.metricMd * 1.1 },
        metricSm: { ...mono, fontSize: theme.type.metricSm, fontWeight: theme.weight.medium, lineHeight: theme.type.metricSm * 1.3, letterSpacing: 0.2 },
      }),
      tones: StyleSheet.create({
        default: { color: theme.color.text },
        muted: { color: theme.color.textMuted },
        subtle: { color: theme.color.textSubtle },
        brand: { color: theme.color.brand },
        onBrand: { color: theme.color.onBrand },
        error: { color: theme.color.error },
      }),
    };
  }, [theme]);

  return (
    <RNText
      style={[variants[variant], tones[tone], center && styles.center, style]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
