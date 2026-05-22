// Wellness claim 의 신뢰등급 (A~E) 을 색상 칩으로 표시.
// 색상은 theme.trust (design-tokens --cb-color-trust-* — CHORE-DESIGN-TRUST-GRADE-001).

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { TrustGrade } from '@celebbase/shared-types';

import { Text, useTheme, type Theme } from '../ui';

interface TrustGradeBadgeProps {
  grade: TrustGrade;
}

export function TrustGradeBadge({ grade }: TrustGradeBadgeProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const palette = theme.trust[grade];
  return (
    <View
      style={[styles.badge, { backgroundColor: palette.bg }]}
      accessibilityLabel={`Trust grade ${grade}`}
    >
      <Text variant="caption" style={[styles.label, { color: palette.fg }]}>
        {grade}
      </Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    badge: {
      minWidth: 24,
      height: 24,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.space(2),
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { fontWeight: theme.weight.bold },
  });
}
