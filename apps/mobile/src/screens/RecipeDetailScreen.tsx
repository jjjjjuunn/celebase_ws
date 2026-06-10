// RecipeDetail — Plan 탭에서 끼니 카드를 탭하면 진입. 에디토리얼 재구성(IMPL-MOBILE-RECIPE-DETAIL-EDITORIAL-001):
//   in-flow 앱바(back) → [사진 있을 때만] contained 둥근 photo 밴드 → eyebrow(meal_type)·큰 serif 타이틀·
//   meta 칩 → 영양 stat 룰밴드(calories focal) → WHY IT FITS soft 칩 → 탭(Ingredients/Recipe) →
//   재료 divider 행 또는 조리단계 안내 → 면책 고지.
//
// 방향 B(gold 앱-표준 유지 — MealPlan 과 일관, 새 이음새 0). 사진은 AI 생성 예정 → 어댑티브 히어로:
//   image_url 있으면 contained 밴드, 없으면(현재) 밴드 생략(어두운 placeholder void 제거). 타이틀은
//   항상 사진 밖(이미지 밝기 무관 가독). AI 사진 도착 시 코드 변경 없이 밴드만 채워진다.
//
// Recipe 탭 = 풀스크린 forest step view 오버레이(스크롤 비의존). current(stepIndex)는 부모 소유 →
//   탭 왕복에도 스텝 보존. 하단 News/Settings 탭바는 MainTabs 가 RecipeDetail 에서 숨긴다.
//   stepsOverlay 는 SafeAreaView 직속(ScrollView 밖) — 회귀 가드.
//
// 데이터: BFF `/api/recipes/:id` → { recipe(RecipeWire), ingredients(lean) }.
// 평점·건강 효능·재료 역할은 데이터 부재 + 효능 주장 출처 규칙 때문에 미구현.
// 화면은 nav 비의존(prop 콜백) — PlanNavigator 가 recipeId/onBack 주입.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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

// 사진 있을 때만 렌더되는 contained 밴드 높이(고정).
const PHOTO_H = 200;

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

type ComponentIcon = React.ComponentProps<typeof Ionicons>['name'];

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
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>({ state: 'loading' });
  const [tab, setTab] = useState<DetailTab>('ingredients');
  const [showMacroDetail, setShowMacroDetail] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  // Recipe 탭 활성 시 RecipeSteps 를 풀스크린 오버레이로 렌더(스크롤 비의존). current 는 부모 소유 →
  // 탭 왕복에도 스텝 보존. 하단 News/Settings 탭바는 MainTabs 가 RecipeDetail 에서 숨긴다.
  const [stepIndex, setStepIndex] = useState(0);

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

  // 단일 in-flow back 컨트롤 — loading/error/ready 세 phase 공유(고아 다크 pill 방지).
  const topBar = (
    <View style={styles.topBar}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.backBtn}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={26} color={theme.color.text} />
      </Pressable>
    </View>
  );

  if (phase.state !== 'ready') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {topBar}
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
  const hasPhoto = recipe.image_url != null && recipe.image_url !== '';
  const description =
    recipe.description != null && recipe.description.trim() !== '' ? recipe.description.trim() : null;
  const macroDetail: Array<{ label: string; value: string }> = [];
  if (n.fiber_g !== undefined) macroDetail.push({ label: 'Fiber', value: `${String(Math.round(n.fiber_g))}g` });
  if (n.sugar_g !== undefined) macroDetail.push({ label: 'Sugar', value: `${String(Math.round(n.sugar_g))}g` });
  if (n.sodium_mg !== undefined) macroDetail.push({ label: 'Sodium', value: `${String(Math.round(n.sodium_mg))}mg` });
  const highlights = nutritionHighlights(n);

  // 헤더 back(⌄) — immersive 이탈(개요로). stepIndex 보존 → Recipe 재진입 시 같은 스텝 재개.
  const exitSteps = (): void => {
    setTab('ingredients');
  };
  // 마지막 "Done" — 개요 복귀 + Step1 리셋(오버레이 unmount → keep-awake 해제).
  const finishSteps = (): void => {
    setTab('ingredients');
    setStepIndex(0);
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
      {topBar}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* 어댑티브 히어로 — 사진 있을 때만 contained 둥근 밴드(타이틀은 사진 밖). 없으면 생략(void 제거). */}
        {hasPhoto ? (
          <View style={styles.photoBand} testID="recipe-photo-band">
            <MealPhoto imageUrl={recipe.image_url} name={recipe.title} fill />
          </View>
        ) : null}

        {/* 에디토리얼 헤더 — eyebrow(meal_type) · 큰 serif 타이틀 · desc · meta 칩 */}
        <View style={styles.header}>
          <Text variant="label" tone="muted">
            {recipe.meal_type}
          </Text>
          <Text variant="display" style={styles.title}>
            {recipe.title}
          </Text>
          {description !== null ? (
            <Text variant="body" tone="muted">
              {description}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {recipe.difficulty !== null ? (
              <MetaChip icon="speedometer-outline" label={capitalize(recipe.difficulty)} />
            ) : null}
            {time !== null ? <MetaChip icon="time-outline" label={`${String(time)} min`} /> : null}
            <MetaChip icon="restaurant-outline" label={`Serves ${String(recipe.servings)}`} />
          </View>
        </View>

        {/* 영양 stat 밴드 — 상·하 룰 사이 4-up(calories focal). 박스 제거. */}
        <View style={styles.statBand}>
          <View style={styles.statRow}>
            <Stat value={String(Math.round(n.calories))} unit="kcal" label="Calories" focal />
            <Stat value={`${String(Math.round(n.protein_g))}g`} unit="" label="Protein" />
            <Stat value={`${String(Math.round(n.carbs_g))}g`} unit="" label="Carbs" />
            <Stat value={`${String(Math.round(n.fat_g))}g`} unit="" label="Fat" />
          </View>
          {macroDetail.length > 0 ? (
            <>
              {showMacroDetail ? (
                <View style={styles.statDetailRow}>
                  {macroDetail.map((m) => (
                    <Stat key={m.label} value={m.value} unit="" label={m.label} />
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
                  {showMacroDetail ? 'Hide detail' : 'View detail'}
                </Text>
                <Ionicons
                  name={showMacroDetail ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={theme.color.brand}
                />
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        {/* WHY IT FITS — 영양 수치 기반 사실(주장 아님). soft 칩으로 별도 모듈 구분. */}
        {highlights.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label" tone="muted">
              WHY IT FITS
            </Text>
            <View style={styles.whyRow}>
              {highlights.map((h) => (
                <View key={h.label} style={styles.whyChip}>
                  <View style={styles.whyIcon}>
                    <Ionicons name={h.icon} size={18} color={theme.color.brand} />
                  </View>
                  <View style={styles.whyText}>
                    <Text variant="body" style={styles.whyLabel}>
                      {h.label}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {h.detail}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* 탭: Ingredients / Recipe */}
        <View style={styles.tabBar}>
          {(['ingredients', 'recipe'] as const).map((t) => {
            const active = t === tab;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => {
                  setTab(t);
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
                const qtyStr = ` (${fmtQty(ing.quantity)} ${ing.unit}${prep})`;
                // 시각은 name + (muted qty) 로 분리되므로 SR 라벨에 전체를 담는다.
                const a11yLabel = `${ing.name}${qtyStr}${ing.is_optional ? ', optional' : ''}`;
                return (
                  <TouchableOpacity
                    key={`${ing.name}-${String(idx)}`}
                    onPress={() => {
                      toggleChecked(idx);
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                    accessibilityLabel={a11yLabel}
                    style={styles.ingredientRow}
                  >
                    <Ionicons
                      name={isChecked ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={isChecked ? theme.color.brand : theme.color.textMuted}
                    />
                    <Text variant="body" style={[styles.ingredientName, isChecked ? styles.ingredientChecked : null]}>
                      {`${ing.name}${qtyStr}`}
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
        ) : null}

        <Text variant="caption" tone="muted" style={styles.disclaimer}>
          This information is for educational purposes only and is not intended as medical advice.
        </Text>
      </ScrollView>

      {/* Recipe 탭 = 몰입형 step view: 스크롤 비의존 풀스크린 오버레이(노치 아래~화면 바닥).
          stepsOverlay 는 SafeAreaView 직속·ScrollView 밖(회귀 가드). 하단 탭바는 MainTabs 가 숨긴다. */}
      {tab === 'recipe' && recipe.instructions.length > 0 ? (
        <View style={[styles.stepsOverlay, { top: insets.top }]}>
          <RecipeSteps
            steps={recipe.instructions}
            tips={recipe.tips ?? null}
            current={stepIndex}
            onStepChange={setStepIndex}
            onDone={finishSteps}
            onExit={exitSteps}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// meta 칩 — light bg 전용 토큰(surface+border). 다크 히어로용 onInk/onBrand 재사용 금지.
function MetaChip({ icon, label }: { icon: ComponentIcon; label: string }): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.metaChip}>
      <Ionicons name={icon} size={13} color={theme.color.textMuted} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

// 영양 stat — calories(focal)=metricLg, P/C/F=metricMd. 값 영역 고정 높이로 라벨 정렬.
function Stat({ value, unit, label, focal = false }: { value: string; unit: string; label: string; focal?: boolean }): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.stat}>
      <View style={styles.statValueWrap}>
        <Text variant={focal ? 'metricLg' : 'metricMd'}>
          {value}
          {unit !== '' ? (
            <Text variant="caption" tone="muted">
              {` ${unit}`}
            </Text>
          ) : null}
        </Text>
      </View>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    // Recipe step view 풀스크린 오버레이 — top 은 인라인 insets.top(노치 아래), 바닥까지.
    stepsOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.news.forest },
    // in-flow 상단 앱바(3 phase 공유). 다크 pill 없음 — 투명 + ink chevron.
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.space(2), paddingVertical: theme.space(2) },
    backBtn: { width: 40, height: 40, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    body: { paddingBottom: theme.space(8) },
    // 사진 있을 때만 — contained 둥근 밴드.
    photoBand: { marginHorizontal: theme.space(4), height: PHOTO_H, borderRadius: theme.radius.lg, overflow: 'hidden' },
    // 에디토리얼 헤더 — paddingTop space(4) 로 앱바 아래 의도적 여백(사진 없을 때 cramped 방지).
    header: { paddingHorizontal: theme.space(4), paddingTop: theme.space(4), gap: theme.space(2) },
    title: { marginTop: theme.space(1) },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginTop: theme.space(1) },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(1),
      paddingHorizontal: theme.space(3),
      paddingVertical: theme.space(1),
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    // 영양 stat 룰밴드 — 상·하 hairline, 박스 없음.
    statBand: {
      marginHorizontal: theme.space(4),
      marginTop: theme.space(5),
      paddingVertical: theme.space(3),
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.color.border,
      gap: theme.space(3),
    },
    statRow: { flexDirection: 'row', justifyContent: 'space-between' },
    statDetailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
      paddingTop: theme.space(3),
    },
    stat: { flex: 1, alignItems: 'center', gap: 2 },
    // 값 영역 고정 높이(=metricLg lineHeight) → metricLg/metricMd 혼용에도 라벨 정렬.
    statValueWrap: { height: Math.round(theme.type.metricLg * 1.12), justifyContent: 'center' },
    detailToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.space(1) },
    // 섹션(WHY IT FITS)
    section: { marginHorizontal: theme.space(4), marginTop: theme.space(5), gap: theme.space(2) },
    whyRow: { flexDirection: 'row', gap: theme.space(3) },
    // soft 칩 — brandSubtle 배경(무거운 테두리 X) → 룰밴드/divider 와 구분되는 별도 모듈.
    whyChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(2),
      padding: theme.space(3),
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.brandSubtle,
    },
    whyIcon: {
      width: 36,
      height: 36,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    whyText: { flex: 1, gap: 2 },
    whyLabel: { fontWeight: theme.weight.semibold },
    // 탭
    tabBar: {
      flexDirection: 'row',
      marginHorizontal: theme.space(4),
      marginTop: theme.space(5),
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    tabItem: { paddingVertical: theme.space(3), marginRight: theme.space(5), borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabItemActive: { borderBottomColor: theme.color.brand },
    tabTextActive: { fontWeight: theme.weight.semibold },
    tabEmpty: { padding: theme.space(6), alignItems: 'center' },
    // 재료 — divider 행(채운 pill 제거), full-row 44px 터치타깃.
    list: { paddingHorizontal: theme.space(4), paddingTop: theme.space(2) },
    ingredientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(3),
      paddingVertical: theme.space(3),
      minHeight: 44,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    ingredientName: { flex: 1 },
    ingredientChecked: { textDecorationLine: 'line-through', color: theme.color.textMuted },
    disclaimer: { paddingHorizontal: theme.space(4), paddingTop: theme.space(5) },
  });
}
