// Cook Mode — 조리 중 한 스텝씩 큰 글자로 보는 전체화면 모드. RecipeDetail 의 긴 문단 밀도
// 문제를 "한 스텝 = 한 화면" chunking 으로 해결(리서치: SideChef/Tasty cook mode 정석).
//
// 구조: RN Modal(Android back = onRequestClose) + 가로 paging ScrollView(ClaimDetail 캐러셀 패턴,
//   reanimated 불요). 각 스텝 = 세로 ScrollView(긴 텍스트 클립 방지). 하단 nav(Ingredients peek +
//   Prev/Next, 마지막/1-step = Finish). 재료 peek = 부분 드로어(하단 nav 안 가림, tap-to-dismiss).
//
// keep-awake lifecycle: useKeepAwake 는 소유 컴포넌트 lifetime 동안 활성이므로, Modal 자식을
//   `visible` 일 때만 마운트(CookModeContent)해 닫으면 자동 해제 — 항상 마운트 시 닫은 뒤에도
//   화면이 켜져 있는 버그 방지(Codex/advisor).

import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useKeepAwake } from 'expo-keep-awake';
import type { schemas } from '@celebbase/shared-types';

import { Text, useTheme, type Theme } from '../ui';

type InstructionStep = schemas.RecipeWire['instructions'][number];
type Ingredient = schemas.RecipeDetailResponse['ingredients'][number];

interface CookModeProps {
  visible: boolean;
  onClose: () => void;
  steps: InstructionStep[];
  ingredients: Ingredient[];
}

export function CookMode({ visible, onClose, steps, ingredients }: CookModeProps): React.JSX.Element {
  // Modal 자식을 visible 일 때만 마운트 → useKeepAwake(자식) 가 닫힐 때 해제된다.
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible ? <CookModeContent onClose={onClose} steps={steps} ingredients={ingredients} /> : null}
    </Modal>
  );
}

function CookModeContent({
  onClose,
  steps,
  ingredients,
}: Omit<CookModeProps, 'visible'>): React.JSX.Element {
  useKeepAwake(); // 조리 중 화면 자동잠금 방지 — 본 컴포넌트 unmount(닫기) 시 해제.
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { width } = useWindowDimensions();
  const total = steps.length;
  const [current, setCurrent] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const clampIdx = (i: number): number => Math.max(0, Math.min(total - 1, i));

  const goTo = (i: number): void => {
    const idx = clampIdx(i);
    setCurrent(idx);
    scrollRef.current?.scrollTo({ x: idx * width, animated: true });
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    if (width <= 0) return;
    setCurrent(clampIdx(Math.round(e.nativeEvent.contentOffset.x / width)));
  };

  const isLast = current >= total - 1;
  const progress = total > 0 ? (current + 1) / total : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 상단: 닫기 + Step i/total + progress */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close cook mode"
          hitSlop={8}
          style={styles.iconBtn}
        >
          <Ionicons name="close" size={26} color={theme.color.text} />
        </TouchableOpacity>
        <Text variant="label" tone="muted" accessibilityLabel={`Step ${String(current + 1)} of ${String(total)}`}>
          {`Step ${String(current + 1)} of ${String(total)}`}
        </Text>
        <View style={styles.iconBtn} />
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { flex: progress }]} />
        <View style={{ flex: 1 - progress }} />
      </View>

      {/* 스텝 영역(가로 paging) + 재료 peek 드로어(이 영역 안 — 하단 nav 안 가림) */}
      <View style={styles.stepArea}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          scrollEventThrottle={16}
        >
          {steps.map((s) => (
            <ScrollView
              key={s.step}
              style={{ width }}
              contentContainerStyle={styles.stepPage}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.stepNumWrap}>
                <Text variant="metricMd" tone="onBrand">
                  {String(s.step)}
                </Text>
              </View>
              <Text variant="body" style={styles.stepText}>
                {s.text}
              </Text>
              {s.duration_min != null ? (
                <View style={styles.durationChip}>
                  <Ionicons name="time-outline" size={15} color={theme.color.brand} />
                  <Text variant="caption" tone="brand">{`${String(s.duration_min)} min`}</Text>
                </View>
              ) : null}
            </ScrollView>
          ))}
        </ScrollView>

        {showIngredients ? (
          <>
            <Pressable
              style={styles.peekScrim}
              accessibilityRole="button"
              accessibilityLabel="Dismiss ingredients"
              onPress={() => {
                setShowIngredients(false);
              }}
            />
            <View style={styles.peekDrawer}>
              <View style={styles.peekHandle} />
              <Text variant="label" tone="muted" style={styles.peekTitle}>
                INGREDIENTS
              </Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {ingredients.length === 0 ? (
                  <Text variant="body" tone="muted">
                    재료 정보가 없어요.
                  </Text>
                ) : (
                  ingredients.map((ing, idx) => {
                    const prep = ing.preparation != null && ing.preparation.trim() !== ''
                      ? ` · ${ing.preparation.trim()}`
                      : '';
                    return (
                      <View key={`${ing.name}-${String(idx)}`} style={styles.peekRow}>
                        <Text variant="body" style={styles.peekItem}>
                          {`${ing.name} (${String(ing.quantity)} ${ing.unit}${prep})`}
                        </Text>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </>
        ) : null}
      </View>

      {/* 하단 nav: Ingredients peek + Prev/Next(or Finish) — peek 드로어가 가리지 않는다 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={() => {
            setShowIngredients((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityLabel={showIngredients ? 'Hide ingredients' : 'Show ingredients'}
          style={styles.ingredientsPill}
        >
          <Ionicons name="list-outline" size={18} color={theme.color.text} />
          <Text variant="bodySm">Ingredients</Text>
        </TouchableOpacity>

        <View style={styles.navBtns}>
          {current > 0 ? (
            <TouchableOpacity
              onPress={() => {
                goTo(current - 1);
              }}
              accessibilityRole="button"
              accessibilityLabel="Previous step"
              style={styles.prevBtn}
            >
              <Ionicons name="arrow-back" size={20} color={theme.color.brand} />
            </TouchableOpacity>
          ) : null}
          {isLast ? (
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Finish"
              style={styles.nextBtn}
            >
              <Text variant="body" tone="onBrand" style={styles.nextLabel}>
                Finish
              </Text>
              <Ionicons name="checkmark" size={18} color={theme.color.onBrand} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => {
                goTo(current + 1);
              }}
              accessibilityRole="button"
              accessibilityLabel="Next step"
              style={styles.nextBtn}
            >
              <Text variant="body" tone="onBrand" style={styles.nextLabel}>
                Next
              </Text>
              <Ionicons name="arrow-forward" size={18} color={theme.color.onBrand} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space(3),
      paddingTop: theme.space(2),
      paddingBottom: theme.space(2),
    },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    progressTrack: {
      flexDirection: 'row',
      height: 4,
      marginHorizontal: theme.space(4),
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.border,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: theme.color.brand },
    stepArea: { flex: 1 },
    stepPage: {
      paddingHorizontal: theme.space(5),
      paddingTop: theme.space(6),
      paddingBottom: theme.space(6),
      gap: theme.space(4),
      flexGrow: 1,
    },
    stepNumWrap: {
      width: 48,
      height: 48,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // 큰 가독 sans 텍스트 + 넉넉한 line-height (밀도↓ 핵심).
    stepText: { fontSize: 20, lineHeight: 30 },
    durationChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(1),
      alignSelf: 'flex-start',
      paddingVertical: theme.space(1),
      paddingHorizontal: theme.space(3),
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.brandSubtle,
    },
    peekScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
    peekDrawer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: '70%',
      backgroundColor: theme.color.surface,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      paddingHorizontal: theme.space(4),
      paddingTop: theme.space(2),
      paddingBottom: theme.space(4),
      gap: theme.space(2),
    },
    peekHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.border,
      marginBottom: theme.space(1),
    },
    peekTitle: { letterSpacing: 0.5 },
    peekRow: { paddingVertical: theme.space(2), borderBottomWidth: 1, borderBottomColor: theme.color.border },
    peekItem: {},
    bottomBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space(4),
      paddingTop: theme.space(2),
      paddingBottom: theme.space(2),
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
    ingredientsPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(2),
      paddingVertical: theme.space(2),
      paddingHorizontal: theme.space(3),
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    navBtns: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
    prevBtn: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.pill,
      borderWidth: 2,
      borderColor: theme.color.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(1),
      paddingVertical: theme.space(2),
      paddingHorizontal: theme.space(4),
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.brand,
    },
    nextLabel: { fontWeight: theme.weight.semibold },
  });
}
