// Wellness claim 의 신뢰등급 (A~E) 을 색상 칩으로 표시.
// 색상은 `--cb-color-trust-{a..e}-{bg,fg}` design-tokens 으로 관리 (CHORE-DESIGN-TRUST-GRADE-001).

import { StyleSheet, Text, View } from 'react-native';

import type { TrustGrade } from '@celebbase/shared-types';

import { px, resolveToken } from '../lib/tokens';
import { tokens } from '@celebbase/design-tokens';

interface TrustGradeBadgeProps {
  grade: TrustGrade;
}

const PALETTE_BY_GRADE: Record<
  TrustGrade,
  { bg: string; fg: string }
> = {
  A: {
    bg: resolveToken('light', '--cb-color-trust-a-bg'),
    fg: resolveToken('light', '--cb-color-trust-a-fg'),
  },
  B: {
    bg: resolveToken('light', '--cb-color-trust-b-bg'),
    fg: resolveToken('light', '--cb-color-trust-b-fg'),
  },
  C: {
    bg: resolveToken('light', '--cb-color-trust-c-bg'),
    fg: resolveToken('light', '--cb-color-trust-c-fg'),
  },
  D: {
    bg: resolveToken('light', '--cb-color-trust-d-bg'),
    fg: resolveToken('light', '--cb-color-trust-d-fg'),
  },
  E: {
    bg: resolveToken('light', '--cb-color-trust-e-bg'),
    fg: resolveToken('light', '--cb-color-trust-e-fg'),
  },
};

export function TrustGradeBadge({ grade }: TrustGradeBadgeProps): React.JSX.Element {
  const palette = PALETTE_BY_GRADE[grade];
  return (
    <View
      style={[styles.badge, { backgroundColor: palette.bg }]}
      accessibilityLabel={`Trust grade ${grade}`}
    >
      <Text style={[styles.label, { color: palette.fg }]}>{grade}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: px(tokens.light['--cb-space-2']),
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: px(tokens.light['--cb-caption']),
    fontWeight: '700',
    lineHeight: px(tokens.light['--cb-caption']) + 2,
  },
});

