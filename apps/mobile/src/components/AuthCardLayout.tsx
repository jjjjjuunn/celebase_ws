// Auth screens 공용 레이아웃 — 웹 `apps/web/src/app/(auth)/layout.tsx` 와 동등.
//
// 페이지 배경 surface(살짝 회색) → 카드 분리 효과. 카드: bg(white) + border +
// radius-lg + soft shadow. 카드 max-width 400 (광폭 대응). 상단 브랜드 워드마크.

import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, useTheme, type Theme } from '../ui';

interface AuthCardLayoutProps {
  children: React.ReactNode;
}

export function AuthCardLayout({ children }: AuthCardLayoutProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text variant="h3" accessibilityRole="header" center>
            CelebBase Wellness
          </Text>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: theme.color.surface },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(5),
    },
    card: {
      width: '100%',
      maxWidth: 400,
      alignSelf: 'center',
      paddingHorizontal: theme.space(5),
      paddingVertical: theme.space(5),
      backgroundColor: theme.color.bg,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      gap: theme.space(4),
      // 웹 box-shadow → RN native shadow. shadowColor 는 토큰(no raw hex).
      ...Platform.select({
        ios: {
          shadowColor: theme.color.text,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
        },
        android: { elevation: 3 },
      }),
    },
  });
}
