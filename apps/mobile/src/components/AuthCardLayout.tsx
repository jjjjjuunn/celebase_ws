// Auth screens 공용 레이아웃 — 웹 `apps/web/src/app/(auth)/layout.tsx` 와 동등.
//
// 디자인 정렬 포인트:
//   - 페이지 배경: `--cb-color-surface` (살짝 회색) → 카드 분리 효과
//   - 카드: `--cb-color-bg` (white) + border + radius-lg + shadow
//   - 카드 max-width 400 (RN 에서는 화면 폭 - 패딩으로 근사. iPad 등 광폭 대응)
//   - 카드 상단 "CelebBase Wellness" 브랜드 텍스트 (display weight 600 size 20)
//   - children 간 gap 은 호출자가 자기 form 안에서 처리.

import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '@celebbase/design-tokens';

import { px, resolveToken } from '../lib/tokens';

interface AuthCardLayoutProps {
  children: React.ReactNode;
}

export function AuthCardLayout({ children }: AuthCardLayoutProps): React.JSX.Element {
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.brand}>
            CelebBase Wellness
          </Text>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: resolveToken('light', '--cb-color-surface'),
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-5']),
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    paddingHorizontal: px(tokens.light['--cb-space-5']),
    paddingVertical: px(tokens.light['--cb-space-5']),
    backgroundColor: resolveToken('light', '--cb-color-bg'),
    borderRadius: px(tokens.light['--cb-radius-lg']),
    borderWidth: 1,
    borderColor: resolveToken('light', '--cb-color-border'),
    gap: px(tokens.light['--cb-space-4']),
    // 웹의 box-shadow 를 RN native shadow API 로 옮김. iOS/Android 분리.
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  brand: {
    fontSize: 20,
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text'),
    textAlign: 'center',
  },
});
