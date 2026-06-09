// RecipeSteps — Recipe 탭의 몰입형 step-by-step (구 CookMode 인라인화).
// 별도 Modal/CTA 없이 Recipe 탭 자체가 한 스텝씩 큰 글자로 보이는 포레스트-다크 뷰.
//
// 구조: 부모(RecipeDetailScreen)가 recipe 탭에서 outer ScrollView 를 잠가(lockOuter) 같은-축
//   중첩 스크롤 충돌을 막으므로, 본 컴포넌트는 가로 paging(스텝) + 각 페이지 세로 ScrollView(긴 텍스트)
//   만 가진다. 부모가 viewport-fill height 를 주입 → forest 가 화면을 채워 "빈 흰배경" 문제를 해소.
//
// 스텝 인덱스(current)는 부모 소유(controlled) — Ingredients 탭 왕복/재진입에도 진행 보존.
// keep-awake 는 화면 포커스 시에만(useIsFocused) 활성 — 스택 이탈 시 화면 안 켜둠.

import { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useKeepAwake } from 'expo-keep-awake';
import type { schemas } from '@celebbase/shared-types';

import { Text, useTheme, type Theme } from '../ui';

type InstructionStep = schemas.RecipeWire['instructions'][number];

interface RecipeStepsProps {
  steps: InstructionStep[];
  tips: string | null;
  /** 부모가 주입하는 viewport-fill 높이 (windowHeight - safeTop - tabBarH). */
  height: number;
  /** 현재 스텝 인덱스 — 부모 소유(controlled, 탭 왕복에도 보존). */
  current: number;
  onStepChange: (index: number) => void;
  /** 마지막 "Done" — 부모가 잠금해제 + 상단 개요 복귀 + Step1 리셋. */
  onDone: () => void;
  /** 헤더 back — immersive 이탈(부모가 Ingredients 탭으로). */
  onExit: () => void;
}

// keep-awake 를 mount 동안만 활성화하는 자식 — 포커스일 때만 렌더해 blur 시 자동 해제.
function KeepAwake(): null {
  useKeepAwake();
  return null;
}

export function RecipeSteps({
  steps,
  tips,
  height,
  current,
  onStepChange,
  onDone,
  onExit,
}: RecipeStepsProps): React.JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { width: windowWidth } = useWindowDimensions();
  // window 너비로 시작(첫 프레임 flash·테스트 무측정 회피) → 컨테이너 onLayout 으로 정밀 보정.
  const [pageWidth, setPageWidth] = useState(windowWidth);
  const scrollRef = useRef<ScrollView>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  const total = steps.length;

  const clampIdx = (index: number): number => Math.max(0, Math.min(total - 1, index));

  // pageWidth 가 잡히면(또는 스텝 수 변동) current 위치로 즉시 정렬 — 재진입 시 같은 스텝 복원.
  useEffect(() => {
    if (pageWidth <= 0) return;
    const idx = Math.max(0, Math.min(total - 1, currentRef.current));
    scrollRef.current?.scrollTo({ x: idx * pageWidth, animated: false });
  }, [pageWidth, total]);

  const goTo = (index: number): void => {
    const idx = clampIdx(index);
    onStepChange(idx);
    if (pageWidth > 0) scrollRef.current?.scrollTo({ x: idx * pageWidth, animated: true });
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    if (pageWidth <= 0) return;
    const idx = clampIdx(Math.round(e.nativeEvent.contentOffset.x / pageWidth));
    if (idx !== currentRef.current) onStepChange(idx);
  };

  const onContainerLayout = (e: LayoutChangeEvent): void => {
    setPageWidth(e.nativeEvent.layout.width);
  };

  const cur = clampIdx(current);
  const isLast = cur >= total - 1;
  const progress = total > 0 ? (cur + 1) / total : 0;
  const navBottom = Math.max(insets.bottom, theme.space(3));

  return (
    <View style={[styles.container, { height }]} onLayout={onContainerLayout}>
      {isFocused ? <KeepAwake /> : null}

      {/* 헤더: back(이탈) + STEP i OF n + progress */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel="Exit step view"
          hitSlop={8}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-down" size={24} color={theme.news.cream} />
        </TouchableOpacity>
        <Text
          variant="label"
          style={styles.counter}
          accessibilityLabel={`Step ${String(cur + 1)} of ${String(total)}`}
        >
          {`STEP ${String(cur + 1)} OF ${String(total)}`}
        </Text>
        <View style={styles.iconBtn} />
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { flex: progress }]} />
        <View style={{ flex: 1 - progress }} />
      </View>

      {/* 스텝(가로 paging) — 각 페이지 = 세로 ScrollView(긴 텍스트 도달 가능). */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        style={styles.pager}
      >
        {steps.map((s, idx) => (
          <ScrollView
            key={s.step}
            style={{ width: pageWidth }}
            contentContainerStyle={styles.page}
            showsVerticalScrollIndicator={false}
          >
            {/* tips → 첫 스텝 상단 Pro tip (조리 전 노출 — 손질/예열 팁 놓침 방지). */}
            {idx === 0 && tips != null && tips.trim() !== '' ? (
              <View style={styles.tipNote}>
                <Ionicons name="bulb-outline" size={16} color={theme.news.lime} />
                <Text variant="bodySm" style={styles.tipText}>
                  {`Pro tip · ${tips.trim()}`}
                </Text>
              </View>
            ) : null}
            <View style={styles.stepBadge}>
              <Text variant="metricMd" style={styles.stepBadgeText}>
                {String(s.step)}
              </Text>
            </View>
            <Text variant="body" style={styles.stepText}>
              {s.text}
            </Text>
            {s.duration_min != null ? (
              <View style={styles.durationChip}>
                <Ionicons name="time-outline" size={15} color={theme.news.forest} />
                <Text variant="caption" style={styles.durationText}>{`${String(s.duration_min)} min`}</Text>
              </View>
            ) : null}
          </ScrollView>
        ))}
      </ScrollView>

      {/* 하단 nav: Prev / (Next | Done) */}
      <View style={[styles.nav, { paddingBottom: navBottom }]}>
        {cur > 0 ? (
          <TouchableOpacity
            onPress={() => {
              goTo(cur - 1);
            }}
            accessibilityRole="button"
            accessibilityLabel="Previous step"
            style={styles.prevBtn}
          >
            <Ionicons name="arrow-back" size={20} color={theme.news.cream} />
          </TouchableOpacity>
        ) : (
          <View style={styles.prevSpacer} />
        )}
        {isLast ? (
          <TouchableOpacity
            onPress={onDone}
            accessibilityRole="button"
            accessibilityLabel="Done"
            style={styles.doneBtn}
          >
            <Text variant="body" style={styles.actionLabel}>
              Done
            </Text>
            <Ionicons name="checkmark" size={18} color={theme.news.forest} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => {
              goTo(cur + 1);
            }}
            accessibilityRole="button"
            accessibilityLabel="Next step"
            style={styles.doneBtn}
          >
            <Text variant="body" style={styles.actionLabel}>
              Next
            </Text>
            <Ionicons name="arrow-forward" size={18} color={theme.news.forest} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const n = theme.news;
  return StyleSheet.create({
    container: { backgroundColor: n.forest, overflow: 'hidden' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space(3),
      paddingTop: theme.space(2),
      paddingBottom: theme.space(2),
    },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    counter: { color: n.cream2, letterSpacing: 1.5 },
    progressTrack: {
      flexDirection: 'row',
      height: 4,
      marginHorizontal: theme.space(4),
      borderRadius: theme.radius.pill,
      backgroundColor: n.forest2,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: n.lime },
    pager: { flex: 1 },
    // 콘텐츠 세로 중앙정렬 → forest 가 height 를 채우고 짧은 스텝도 빈 여백 없이 보인다.
    page: {
      paddingHorizontal: theme.space(5),
      paddingVertical: theme.space(5),
      gap: theme.space(4),
      flexGrow: 1,
      justifyContent: 'center',
    },
    tipNote: {
      flexDirection: 'row',
      gap: theme.space(2),
      alignItems: 'flex-start',
      padding: theme.space(3),
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: n.cream2,
    },
    tipText: { flex: 1, color: n.cream2 },
    stepBadge: {
      width: 48,
      height: 48,
      borderRadius: theme.radius.pill,
      backgroundColor: n.lime,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBadgeText: { color: n.forest },
    // 큰 cream 텍스트 + 넉넉한 line-height (몰입 가독).
    stepText: { color: n.cream, fontSize: 24, lineHeight: 34 },
    durationChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(1),
      alignSelf: 'flex-start',
      paddingVertical: theme.space(1),
      paddingHorizontal: theme.space(3),
      borderRadius: theme.radius.pill,
      backgroundColor: n.cream,
    },
    durationText: { color: n.forest },
    nav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space(4),
      paddingTop: theme.space(3),
      borderTopWidth: 1,
      borderTopColor: n.forest2,
    },
    prevBtn: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.pill,
      borderWidth: 2,
      borderColor: n.cream,
      alignItems: 'center',
      justifyContent: 'center',
    },
    prevSpacer: { width: 44, height: 44 },
    doneBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(1),
      paddingVertical: theme.space(2),
      paddingHorizontal: theme.space(5),
      borderRadius: theme.radius.pill,
      backgroundColor: n.lime,
    },
    actionLabel: { color: n.forest, fontWeight: theme.weight.semibold },
  });
}
