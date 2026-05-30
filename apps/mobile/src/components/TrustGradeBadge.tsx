// Wellness claim 신뢰등급 배지 (A~E) — Design Canvas v1 (IMPL-MOBILE-NEWS-CARD-CANVAS-001).
// A: solid forest+lime · B: outline forest · C: outline clay · D: clay tint+면책 · E: 미렌더(draft only).
// 색은 theme.news.trust (design-tokens --cb-news-trust-*).

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { TrustGrade } from '@celebbase/shared-types';

import { Text, useTheme, type Theme } from '../ui';

interface TrustGradeBadgeProps {
  grade: TrustGrade;
}

export function TrustGradeBadge({ grade }: TrustGradeBadgeProps): React.JSX.Element | null {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // E 는 published 금지(draft only) — 렌더하지 않는다 (Canvas v1 §2).
  if (grade === 'E') return null;

  const t = theme.news.trust;
  const style =
    grade === 'A'
      ? { backgroundColor: t.A.bg, color: t.A.fg, borderColor: 'transparent' }
      : grade === 'B'
        ? { backgroundColor: 'transparent', color: t.B.fg, borderColor: t.B.border }
        : grade === 'C'
          ? { backgroundColor: 'transparent', color: t.C.fg, borderColor: t.C.border }
          : { backgroundColor: t.D.bg, color: t.D.fg, borderColor: t.D.border };

  return (
    <View
      style={[styles.badge, { backgroundColor: style.backgroundColor, borderColor: style.borderColor }]}
      accessibilityLabel={`Trust grade ${grade}`}
    >
      <Text style={[styles.label, { color: style.color }]}>{`TRUST ${grade}`}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    badge: {
      borderRadius: theme.radius.sm,
      borderWidth: 1.4,
      paddingHorizontal: theme.space(2),
      paddingVertical: 3,
      alignSelf: 'flex-start',
    },
    label: {
      fontFamily: theme.font.mono,
      fontSize: 10,
      fontWeight: theme.weight.semibold,
      letterSpacing: 0.6,
    },
  });
}
