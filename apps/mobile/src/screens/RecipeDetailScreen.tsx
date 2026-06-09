// RecipeDetail — Plan 탭에서 끼니 카드를 탭하면 진입. 레퍼런스("Recipe Details") 레이아웃:
//   풀블리드 사진(+back) → 제목/메타(난이도·시간·인분) → 영양 카드(+상세 토글) →
//   탭(Ingredients / Recipe) → 재료 목록 또는 조리 단계 → 면책 고지.
//
// 데이터: BFF `/api/recipes/:id` → { recipe(RecipeWire), ingredients(lean) }.
// 재료는 BFF 가 recipe_ingredients join 을 매핑 — 해당 BFF 변경 배포 전엔 빈 배열이라
// Ingredients 탭은 graceful 안내를 띄운다(레시피/영양/사진은 기존 API 로 즉시 표시).
//
// 평점·건강 효능·재료 역할(메인/서브) 은 데이터 부재 + 효능 주장 출처 규칙 때문에 미구현.
// 화면은 nav 비의존(prop 콜백) — PlanNavigator 가 recipeId/onBack 주입.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { schemas } from '@celebbase/shared-types';

import { RecipeSteps } from '../components/RecipeSteps';
import { MealPhoto } from '../components/MealPhoto';
import { getRecipeDetail } from '../services/recipes';
import { EmptyState, Text, useTheme, type Theme } from '../ui';

interface RecipeDetailScreenProps {
  recipeId: string;
  onBack: () => void;
}

type Recipe = schemas.RecipeDetailResponse['recipe'];
type Ingredient = schemas.RecipeDetailResponse['ingredients'][number];

type Phase =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; recipe: Recipe; ingredients: Ingredient[] };

type DetailTab = 'ingredients' | 'recipe';

const HERO_HEIGHT = 300;
const DEFAULT_TAB_BAR_H = 48;

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** prep + cook 분 합. 미상이면 null. */
function totalMinutes(recipe: Recipe): number | null {
  const total = (recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0);
  return total > 0 ? total : null;
}

/** 수량 표기. e.g. 8 → "8", 0.5 → "0.5". */
function fmtQty(n: number): string {
  return String(n);
}

interface Highlight {
  icon: ComponentIcon;
  label: string;
  detail: string;
}

// 영양 수치 기반 사실 하이라이트 (의학적 효능 주장 아님 — 출처 불필요). 적용되는 것 중 최대 2개.
// TODO(효능 데이터셋): 출처 있는 건강 효능 데이터가 생기면 이 섹션을 그것으로 교체/보강.
function nutritionHighlights(n: Recipe['nutrition']): Highlight[] {
  const out: Highlight[] = [];
  if (n.protein_g >= 20) {
    out.push({ icon: 'barbell-outline', label: 'High protein', detail: `${String(Math.round(n.protein_g))}g protein` });
  }
  if (n.fiber_g !== undefined && n.fiber_g >= 5) {
    out.push({ icon: 'leaf-outline', label: 'High fiber', detail: `${String(Math.round(n.fiber_g))}g fiber` });
  }
  if (n.sodium_mg !== undefined && n.sodium_mg <= 140) {
    out.push({ icon: 'water-outline', label: 'Low sodium', detail: `${String(Math.round(n.sodium_mg))}mg sodium` });
  }
  if (n.sugar_g !== undefined && n.sugar_g <= 5) {
    out.push({ icon: 'cube-outline', label: 'Low sugar', detail: `${String(Math.round(n.sugar_g))}g sugar` });
  }
  if (n.carbs_g <= 20) {
    out.push({ icon: 'nutrition-outline', label: 'Low carb', detail: `${String(Math.round(n.carbs_g))}g carbs` });
  }
  return out.slice(0, 2);
}

export function RecipeDetailScreen({ recipeId, onBack }: RecipeDetailScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [phase, setPhase] = useState<Phase>({ state: 'loading' });
  const [tab, setTab] = useState<DetailTab>('ingredients');
  const [showMacroDetail, setShowMacroDetail] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  // Recipe 탭 = 몰입 step view. lockOuter=true 는 항상 tab==='recipe' 와 함께(Model B 불변식):
  // 잠금해제 전환은 항상 탭 이탈과 동반 → "unlock 된 채 recipe 탭에 머무는 상태" 부재.
  const [lockOuter, setLockOuter] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [tabBarY, setTabBarY] = useState(0);
  const [tabBarH, setTabBarH] = useState(DEFAULT_TAB_BAR_H);

  useEffect(() => {
    let cancelled = false;
    setPhase({ state: 'loading' });
    getRecipeDetail(recipeId)
      .then((res) => {
        if (cancelled) return;
        setPhase({ state: 'ready', recipe: res.recipe, ingredients: res.ingredients });
      })
      .catch(() => {
        if (cancelled) return;
        setPhase({ state: 'error' });
      });
    return (): void => {
      cancelled = true;
    };
  }, [recipeId]);

  const backButton = (
    <Pressable
      onPress={onBack}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={styles.backBtn}
      hitSlop={8}
    >
      <Ionicons name="arrow-back" size={22} color={theme.color.onInk} />
    </Pressable>
  );

  if (phase.state !== 'ready') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.plainHeader}>{backButton}</View>
        {phase.state === 'loading' ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.color.brand} />
          </View>
        ) : (
          <EmptyState
            icon="alert-circle-outline"
            title="레시피를 불러오지 못했어요"
            body="잠시 후 다시 시도해주세요."
          />
        )}
      </SafeAreaView>
    );
  }

  const { recipe, ingredients } = phase;
  const n = recipe.nutrition;
  const time = totalMinutes(recipe);
  const macroDetail: Array<{ label: string; value: string }> = [];
  if (n.fiber_g !== undefined) macroDetail.push({ label: 'Fiber', value: `${String(Math.round(n.fiber_g))}g` });
  if (n.sugar_g !== undefined) macroDetail.push({ label: 'Sugar', value: `${String(Math.round(n.sugar_g))}g` });
  if (n.sodium_mg !== undefined) macroDetail.push({ label: 'Sodium', value: `${String(Math.round(n.sodium_mg))}mg` });
  const highlights = nutritionHighlights(n);

  // RecipeSteps 가 채울 viewport 높이(탭바를 상단 pin 한 뒤 그 아래 전체).
  const fillH = windowHeight - insets.top - tabBarH;

  // Model B 전이 — lockOuter 는 항상 tab==='recipe'(스텝 있음) 와 함께만 true.
  const selectTab = (t: DetailTab): void => {
    if (t === 'recipe' && recipe.instructions.length > 0 && tabBarY > 0) {
      // 탭바를 viewport 상단으로 pin → outer 잠금(immersive). lock 은 tabBarY 측정 후에만.
      scrollRef.current?.scrollTo({ y: tabBarY, animated: true });
      setTab('recipe');
      setLockOuter(true);
    } else {
      setTab(t);
      setLockOuter(false);
    }
  };
  // 헤더 back — immersive 이탈(개요 접근). 스텝 진행(stepIndex)은 보존 → 재진입 시 재개.
  const exitSteps = (): void => {
    setTab('ingredients');
    setLockOuter(false);
  };
  // 마지막 "Done" — 개요 복귀 + Step1 리셋 + 탭 이탈로 keep-awake 해제.
  const finishSteps = (): void => {
    setTab('ingredients');
    setLockOuter(false);
    setStepIndex(0);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const toggleChecked = (idx: number): void => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        scrollEnabled={!lockOuter}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        testID="recipe-detail-scroll"
      >
        {/* Hero — 풀블리드 사진 + back + 제목/메타 오버레이 */}
        <View style={styles.hero}>
          <MealPhoto imageUrl={recipe.image_url} name={recipe.title} fill />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.7)']}
            locations={[0, 0.45, 1]}
            style={styles.heroScrim}
          />
          {backButton}
          <View style={styles.heroText}>
            <Text variant="h1" tone="onBrand" style={styles.heroTitle}>
              {recipe.title}
            </Text>
            <View style={styles.metaRow}>
              {recipe.difficulty !== null ? (
                <Meta icon="speedometer-outline" label={capitalize(recipe.difficulty)} />
              ) : null}
              {time !== null ? <Meta icon="time-outline" label={`${String(time)} min`} /> : null}
              <Meta icon="restaurant-outline" label={`Serves ${String(recipe.servings)}`} />
            </View>
          </View>
        </View>

        {/* 영양 카드 */}
        <View style={styles.nutritionCard}>
          <View style={styles.macroRow}>
            <Macro value={String(Math.round(n.calories))} unit="kcal" label="Calories" />
            <Macro value={`${String(Math.round(n.protein_g))}g`} unit="" label="Protein" />
            <Macro value={`${String(Math.round(n.carbs_g))}g`} unit="" label="Carbs" />
            <Macro value={`${String(Math.round(n.fat_g))}g`} unit="" label="Fat" />
          </View>
          {macroDetail.length > 0 ? (
            <>
              {showMacroDetail ? (
                <View style={styles.macroDetailRow}>
                  {macroDetail.map((m) => (
                    <Macro key={m.label} value={m.value} unit="" label={m.label} />
                  ))}
                </View>
              ) : null}
              <TouchableOpacity
                onPress={() => {
                  setShowMacroDetail((v) => !v);
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: showMacroDetail }}
                style={styles.detailToggle}
              >
                <Text variant="bodySm" tone="brand">
                  {showMacroDetail ? 'Hide detail' : 'View Detail'}
                </Text>
                <Ionicons
                  name={showMacroDetail ? 'chevron-up' : 'chevron-forward'}
                  size={14}
                  color={theme.color.brand}
                />
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        {/* Highlights — 영양 수치 기반 사실(주장 아님). 효능 데이터셋 생기면 교체 예정. */}
        {highlights.length > 0 ? (
          <View style={styles.section}>
            <Text variant="h3" style={styles.sectionTitle}>
              Highlights
            </Text>
            <View style={styles.highlightRow}>
              {highlights.map((h) => (
                <View key={h.label} style={styles.highlightCard}>
                  <View style={styles.highlightIcon}>
                    <Ionicons name={h.icon} size={20} color={theme.color.brand} />
                  </View>
                  <Text variant="body" style={styles.highlightLabel}>
                    {h.label}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {h.detail}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* 탭: Ingredients / Recipe */}
        <View
          style={styles.tabBar}
          testID="recipe-tabbar"
          onLayout={(e: LayoutChangeEvent) => {
            setTabBarY(e.nativeEvent.layout.y);
            setTabBarH(e.nativeEvent.layout.height);
          }}
        >
          {(['ingredients', 'recipe'] as const).map((t) => {
            const active = t === tab;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => {
                  selectTab(t);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.tabItem, active ? styles.tabItemActive : null]}
              >
                <Text variant="body" tone={active ? 'brand' : 'muted'} style={active ? styles.tabTextActive : undefined}>
                  {t === 'ingredients' ? 'Ingredients' : 'Recipe'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 탭 본문 */}
        {tab === 'ingredients' ? (
          ingredients.length === 0 ? (
            <View style={styles.tabEmpty}>
              <Text variant="body" tone="muted" center>
                재료 정보는 곧 제공돼요.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {ingredients.map((ing, idx) => {
                const isChecked = checked.has(idx);
                // preparation 은 다수 채워짐(chopped 등)이나 빈 문자열도 있어 가드 후 표기.
                const prep =
                  ing.preparation != null && ing.preparation.trim() !== ''
                    ? ` · ${ing.preparation.trim()}`
                    : '';
                return (
                  <TouchableOpacity
                    key={`${ing.name}-${String(idx)}`}
                    onPress={() => {
                      toggleChecked(idx);
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                    accessibilityLabel={ing.name}
                    style={styles.ingredientRow}
                  >
                    <Ionicons
                      name={isChecked ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={isChecked ? theme.color.brand : theme.color.textMuted}
                    />
                    <Text variant="body" style={[styles.ingredientName, isChecked ? styles.ingredientChecked : null]}>
                      {`${ing.name} (${fmtQty(ing.quantity)} ${ing.unit}${prep})`}
                    </Text>
                    {ing.is_optional ? (
                      <Text variant="caption" tone="muted">
                        Optional
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        ) : recipe.instructions.length === 0 ? (
          <View style={styles.tabEmpty}>
            <Text variant="body" tone="muted" center>
              조리 단계가 아직 없어요.
            </Text>
          </View>
        ) : (
          <RecipeSteps
            steps={recipe.instructions}
            tips={recipe.tips ?? null}
            height={fillH}
            current={stepIndex}
            onStepChange={setStepIndex}
            onDone={finishSteps}
            onExit={exitSteps}
          />
        )}

        <Text variant="caption" tone="muted" style={styles.disclaimer}>
          This information is for educational purposes only and is not intended as medical advice.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Meta({ icon, label }: { icon: ComponentIcon; label: string }): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={14} color={theme.color.onInk} />
      <Text variant="caption" tone="onBrand">
        {label}
      </Text>
    </View>
  );
}

function Macro({ value, unit, label }: { value: string; unit: string; label: string }): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.macro}>
      <Text variant="metricMd" tone="brand">
        {value}
        {unit !== '' ? (
          <Text variant="caption" tone="brand">
            {` ${unit}`}
          </Text>
        ) : null}
      </Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

type ComponentIcon = React.ComponentProps<typeof Ionicons>['name'];

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    plainHeader: { paddingHorizontal: theme.space(4), paddingVertical: theme.space(3) },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    body: { paddingBottom: theme.space(8) },
    hero: { height: HERO_HEIGHT, width: '100%' },
    // 그라데이션 scrim — hero 전체에 깔되 하단으로 갈수록 어둡게(제목 가독; 실사진 대비).
    heroScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    backBtn: {
      position: 'absolute',
      top: theme.space(3),
      left: theme.space(4),
      width: 40,
      height: 40,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.ink,
      opacity: 0.85,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroText: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: theme.space(4), gap: theme.space(2) },
    heroTitle: { fontFamily: theme.font.display, color: theme.color.onInk },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(3) },
    meta: { flexDirection: 'row', alignItems: 'center', gap: theme.space(1) },
    nutritionCard: {
      margin: theme.space(4),
      padding: theme.space(4),
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      gap: theme.space(3),
    },
    macroRow: { flexDirection: 'row', justifyContent: 'space-between' },
    macroDetailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
      paddingTop: theme.space(3),
    },
    macro: { alignItems: 'center', gap: 2, flex: 1 },
    detailToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: theme.space(1) },
    section: { marginHorizontal: theme.space(4), marginBottom: theme.space(3), gap: theme.space(2) },
    sectionTitle: { fontFamily: theme.font.display },
    highlightRow: { flexDirection: 'row', gap: theme.space(3) },
    highlightCard: {
      flex: 1,
      padding: theme.space(3),
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      gap: 2,
    },
    highlightIcon: {
      width: 36,
      height: 36,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.brandSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.space(1),
    },
    highlightLabel: { fontWeight: theme.weight.semibold },
    tabBar: {
      flexDirection: 'row',
      marginHorizontal: theme.space(4),
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    tabItem: { paddingVertical: theme.space(3), marginRight: theme.space(5), borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabItemActive: { borderBottomColor: theme.color.brand },
    tabTextActive: { fontWeight: theme.weight.semibold },
    tabEmpty: { padding: theme.space(6), alignItems: 'center' },
    list: { paddingHorizontal: theme.space(4), paddingTop: theme.space(3), gap: theme.space(2) },
    ingredientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(3),
      paddingVertical: theme.space(3),
      paddingHorizontal: theme.space(4),
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.surface,
    },
    ingredientName: { flex: 1 },
    ingredientChecked: { textDecorationLine: 'line-through', color: theme.color.textMuted },
    disclaimer: { paddingHorizontal: theme.space(4), paddingTop: theme.space(5) },
  });
}
