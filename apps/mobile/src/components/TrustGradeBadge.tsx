// Wellness claim 의 신뢰등급 (A~E) 을 색상 칩으로 표시.
//
// design-tokens 에 trust-grade 전용 토큰이 아직 없어 컴포넌트 내부 4색 상수로
// 시작한다. 후속 chore (CHORE-DESIGN-TRUST-GRADE-001) 에서 `--cb-color-trust-{a..d}`
// 토큰 추가 후 본 상수는 resolveToken 으로 대체 예정.

import { StyleSheet, Text, View } from 'react-native';

import type { TrustGrade } from '@celebbase/shared-types';

import { px } from '../lib/tokens';
import { tokens } from '@celebbase/design-tokens';

interface TrustGradeBadgeProps {
  grade: TrustGrade;
}

const COLOR_BY_GRADE: Record<TrustGrade, { bg: string; fg: string; label: string }> = {
  A: { bg: '#0E8F7D', fg: '#FFFFFF', label: 'A' },
  B: { bg: '#C9A84C', fg: '#1A1917', label: 'B' },
  C: { bg: '#D4654A', fg: '#FFFFFF', label: 'C' },
  D: { bg: '#B4232C', fg: '#FFFFFF', label: 'D' },
  E: { bg: '#6A737C', fg: '#FFFFFF', label: 'E' },
};

export function TrustGradeBadge({ grade }: TrustGradeBadgeProps): React.JSX.Element {
  const palette = COLOR_BY_GRADE[grade];
  return (
    <View
      style={[styles.badge, { backgroundColor: palette.bg }]}
      accessibilityLabel={`신뢰등급 ${grade}`}
    >
      <Text style={[styles.label, { color: palette.fg }]}>{palette.label}</Text>
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

