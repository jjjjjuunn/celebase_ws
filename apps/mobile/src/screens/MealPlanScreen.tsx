// MealPlan — Plan tab 의 root. 레이아웃:
//   상단 헤더(타이틀 + 크레딧 + 생성) → 오늘 중앙 5일 스트립 →
//   좌측 meal-type 기둥(아이콘 + 라벨, 스크롤 위치 인디케이터) +
//   우측 하루치 끼니의 세로 스냅 스크롤(끼니 사진이 본문의 70%, 다음 끼니가 아래에 peek).
//
// 상호작용: 우측을 세로로 스냅 스크롤하면 현재 보이는 끼니의 meal_type 으로 좌측 기둥이
//   강조된다(아침 끼니 → "Breakfast" 강조). 좌측 라벨 탭은 해당 끼니로 점프한다.
//
// 데이터(한 reload 에서 병렬 fetch): bio-profile(온보딩 여부) · credits(잔량) · plans(목록).
// 게이트: 미온보딩 → 온보딩 CTA. 그 외 → 헤더에 compact 크레딧 + 생성(+) 버튼.
// 캘린더: 모든 non-failed plan 의 daily_plans 를 date→day 맵으로(최신 plan 우선). 5일 스트립은
//   plan 유무와 무관하게 항상 오늘 기준 ±2일을 보여주고, 날짜별 식단은 맵에서 조회(없으면 빈 상태).
//
// 네비게이션은 prop 콜백으로 주입(PlanNavigator) — 화면은 nav 비의존(테스트 용이).

import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { schemas } from '@celebbase/shared-types';

import { MealPhoto } from '../components/MealPhoto';
import { MealPlanGenerateSheet } from '../components/MealPlanGenerateSheet';
import { ApiError } from '../lib/api-client';
import { getBioProfile } from '../services/bio-profile';
import { getBaseDiet, listCelebrities } from '../services/celebrities';
import { getMealPlanCredits, listMyMealPlans } from '../services/meal-plans';
import { getRecipesByIds } from '../services/recipes';
import { Badge, EmptyState, Text, useTheme, type Theme } from '../ui';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface MealPlanScreenProps {
  onNavigateOnboarding: () => void;
  onNavigatePaywall: () => void;
  /** 끼니 카드 탭 → recipe 상세. PlanNavigator 가 주입(선택적 — 테스트는 미주입). */
  onNavigateRecipe?: (recipeId: string) => void;
  /** PlanNavigator focus refresh 트리거 — 값이 바뀌면 전체 reload. */
  reloadKey?: number;
}

/** recipe_id → 표시에 필요한 메타 (제목 · 사진 · meal_type · 조리시간). */
interface RecipeMeta {
  title: string;
  imageUrl: string | null;
  mealType: string;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  description: string | null;
  /** recipe base calories — fallback when the meal has no adjusted_nutrition. */
  calories: number | null;
}

interface ScreenData {
  bioPresent: boolean;
  credits: schemas.MealPlanCreditsResponse | null;
  plans: schemas.MealPlanWire[];
  celebNameByBaseDiet: Record<string, string>;
  recipeById: Record<string, RecipeMeta>;
}

type Phase = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: ScreenData };

type DailyMeal = schemas.MealPlanWire['daily_plans'][number]['meals'][number];
type DailyTotals = schemas.MealPlanWire['daily_plans'][number]['daily_totals'];

interface CalendarDay {
  date: string;
  day: number;
  celebName: string | null;
  meals: DailyMeal[];
  dailyTotals: DailyTotals;
}

// 좌측 기둥의 고정 4 끼니 (사용자 명시 순서: 아침·점심·간식·저녁).
// 데이터의 meal_type 이 'smoothie' 등 비표준이면 이번 범위에서는 표시하지 않는다.
type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner';
const MEAL_SLOTS: ReadonlyArray<{ type: MealSlot; label: string; icon: IoniconName }> = [
  { type: 'breakfast', label: 'Breakfast', icon: 'sunny-outline' },
  { type: 'lunch', label: 'Lunch', icon: 'restaurant-outline' },
  { type: 'snack', label: 'Snack', icon: 'nutrition-outline' },
  { type: 'dinner', label: 'Dinner', icon: 'moon-outline' },
];

const SLOT_ORDER: Record<string, number> = Object.fromEntries(
  MEAL_SLOTS.map((s, i) => [s.type, i]),
);

// 사진을 뺀 카드 고정 영역(라벨 + 이름 + 정보 row) 예약 높이. itemHeight = round(body*0.7) + 이 값.
const CARD_CHROME = 92;
// 카드 전체 차지 비율은 0.7 로 유지(스냅/peek 동일) 하되, 사진만 20% 줄여(0.7→0.56) 남는
// 공간을 칼로리·조리시간·매크로 정보 row 로 채운다.
const ITEM_BODY_FRACTION = 0.7;
const PHOTO_BODY_FRACTION = 0.56;
// 좌측 기둥 버튼 1.5× (기존 44/22 → 66/33).
const RAIL_WIDTH = 80;
const RAIL_BTN = 66;
const RAIL_GLYPH = 33;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function toISODate(d: Date): string {
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface WeekCell {
  date: string;
  weekday: string;
  dayNum: string;
}

// 오늘을 중앙(index 2)에 둔 5일 [-2 … +2]. local 날짜 기준 — toISOString 의 UTC shift 회피.
function buildWeek(today: Date): WeekCell[] {
  const cells: WeekCell[] = [];
  for (let offset = -2; offset <= 2; offset += 1) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    cells.push({ date: toISODate(d), weekday: WEEKDAYS[d.getDay()], dayNum: String(d.getDate()) });
  }
  return cells;
}

async function loadScreen(): Promise<ScreenData> {
  // bio: 404 → 미온보딩(absent). 그 외 에러는 throw → 화면 error.
  const bioPromise = getBioProfile()
    .then(() => true)
    .catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 404) return false;
      throw err;
    });
  // credits: 실패 시 null (fail-closed — 게이트가 잔량 0 으로 취급).
  const creditsPromise = getMealPlanCredits().catch(() => null);
  const plansPromise = listMyMealPlans().then((res) => res.items);

  const [bioPresent, credits, plans] = await Promise.all([
    bioPromise,
    creditsPromise,
    plansPromise,
  ]);

  const [celebNameByBaseDiet, recipeById] = await Promise.all([
    resolveCelebNames(plans),
    resolveRecipes(plans),
  ]);
  return { bioPresent, credits, plans, celebNameByBaseDiet, recipeById };
}

// recipe_id → 제목·사진·meal_type 로컬 조인 (rule #10: content-service 소유 데이터).
// non-failed plan 의 distinct recipe_id 만 batch 조회. best-effort — 실패 시 메타 생략.
async function resolveRecipes(
  plans: schemas.MealPlanWire[],
): Promise<Record<string, RecipeMeta>> {
  const ids = Array.from(
    new Set(
      plans
        .filter((p) => p.status !== 'failed')
        .flatMap((p) => p.daily_plans)
        .flatMap((dp) => dp.meals)
        .map((m) => m.recipe_id),
    ),
  );
  if (ids.length === 0) return {};

  const res = await getRecipesByIds(ids).catch(() => null);
  if (res === null) return {};

  const map: Record<string, RecipeMeta> = {};
  for (const r of res.recipes) {
    map[r.id] = {
      title: r.title,
      imageUrl: r.image_url,
      mealType: r.meal_type,
      prepTimeMin: r.prep_time_min,
      cookTimeMin: r.cook_time_min,
      description: r.description,
      calories: r.nutrition.calories,
    };
  }
  return map;
}

// base_diet_id → 셀럽 display_name 로컬 조인 (rule #10: content-service 소유 데이터).
// distinct base_diet_id 만 조회(plan 수 기준 bound). best-effort — 실패 시 이름 생략.
async function resolveCelebNames(
  plans: schemas.MealPlanWire[],
): Promise<Record<string, string>> {
  const baseDietIds = Array.from(new Set(plans.map((p) => p.base_diet_id)));
  if (baseDietIds.length === 0) return {};

  const [baseDiets, celebs] = await Promise.all([
    Promise.all(
      baseDietIds.map((id) =>
        getBaseDiet(id)
          .then((res) => res.base_diet)
          .catch(() => null),
      ),
    ),
    listCelebrities()
      .then((res) => res.items)
      .catch(() => [] as schemas.CelebrityWire[]),
  ]);

  const nameByCelebId = new Map(celebs.map((c) => [c.id, c.display_name]));
  const map: Record<string, string> = {};
  for (const bd of baseDiets) {
    if (bd === null) continue;
    const name = nameByCelebId.get(bd.celebrity_id);
    if (name !== undefined) map[bd.id] = name;
  }
  return map;
}

function buildCalendar(
  plans: schemas.MealPlanWire[],
  celebNameByBaseDiet: Record<string, string>,
): Map<string, CalendarDay> {
  // created_at 오름차순으로 채워 최신 plan 이 같은 날짜를 덮어쓰게 한다(최신 우선).
  const sorted = [...plans]
    .filter((p) => p.status !== 'failed')
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  const byDate = new Map<string, CalendarDay>();
  for (const plan of sorted) {
    for (const dp of plan.daily_plans) {
      byDate.set(dp.date, {
        date: dp.date,
        day: dp.day,
        celebName: celebNameByBaseDiet[plan.base_diet_id] ?? null,
        meals: dp.meals,
        dailyTotals: dp.daily_totals,
      });
    }
  }
  return byDate;
}

/** credits 잔량 → 생성 가능 일수. null(fetch 실패)=0, unlimited override=무제한(7). */
function remainingDays(credits: schemas.MealPlanCreditsResponse | null): number {
  if (credits === null) return 0;
  if (credits.credits_remaining === null) return 7; // unlimited override
  return credits.credits_remaining;
}

// recipe_id 조회 — 미해석(undefined) 케이스를 함수 경계에서 명시한다. const 직접 인덱싱은
// 초기화값 타입(RecipeMeta)으로 좁혀져 호출부의 optional chain 이 "불필요"로 오인된다.
function lookupMeta(recipeById: Record<string, RecipeMeta>, id: string): RecipeMeta | undefined {
  return recipeById[id];
}

/** prep + cook 분 합. 미상이면 null(미표시). */
function formatPrepTime(meta?: RecipeMeta): string | null {
  if (meta === undefined) return null;
  const total = (meta.prepTimeMin ?? 0) + (meta.cookTimeMin ?? 0);
  return total > 0 ? `${String(total)} min` : null;
}

/** 메뉴 한줄 overview — recipe description(식재료/레시피 요약) 우선, 없으면 meal.narrative. ≤7 단어. */
function mealOverview(meal: DailyMeal, meta?: RecipeMeta): string | null {
  const desc = meta?.description;
  const src = desc != null && desc.trim() !== '' ? desc : meal.narrative;
  if (src == null || src.trim() === '') return null;
  const words = src.trim().split(/\s+/);
  if (words.length <= 7) return src.trim().replace(/\.+$/, '');
  return `${words.slice(0, 7).join(' ')}…`;
}

/** 끼니 표시 이름: recipe 제목 > narrative > recipe_id 단축. */
function pickMealName(meal: DailyMeal, meta?: RecipeMeta): string {
  if (meta?.title != null && meta.title !== '') return meta.title;
  if (meal.narrative != null && meal.narrative !== '') return meal.narrative;
  return `Recipe #${meal.recipe_id.slice(0, 8)}`;
}

export function MealPlanScreen({
  onNavigateOnboarding,
  onNavigatePaywall,
  onNavigateRecipe,
  reloadKey = 0,
}: MealPlanScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { height: windowHeight } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>({ state: 'loading' });
  const [reloadCounter, setReloadCounter] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(false);

  const today = useMemo(() => new Date(), []);
  const todayISO = useMemo(() => toISODate(today), [today]);
  const week = useMemo(() => buildWeek(today), [today]);

  const [selectedDate, setSelectedDate] = useState<string>(todayISO);
  // 현재 스크롤 위치의 끼니 — 좌측 기둥 강조에 쓰인다(탭 셀렉터 아님, 스크롤에서 파생).
  const [activeMealType, setActiveMealType] = useState<MealSlot>('breakfast');

  // 본문 높이 — onLayout 으로 측정하되, 측정 전엔 window 기반 추정값으로 시드한다.
  // (RTL 테스트 환경은 onLayout 을 발화하지 않으므로 렌더를 측정값에 gate 하면 안 된다.)
  const [measuredBody, setMeasuredBody] = useState(0);
  const bodyHeight = measuredBody > 0 ? measuredBody : Math.round(windowHeight * 0.6);
  const photoHeight = Math.max(0, Math.round(bodyHeight * PHOTO_BODY_FRACTION));
  const itemHeight = Math.round(bodyHeight * ITEM_BODY_FRACTION) + CARD_CHROME;

  const listRef = useRef<FlatList<DailyMeal>>(null);

  useEffect(() => {
    let cancelled = false;
    setPhase({ state: 'loading' });
    loadScreen()
      .then((data) => {
        if (cancelled) return;
        setPhase({ state: 'ready', data });
      })
      .catch(() => {
        if (cancelled) return;
        setPhase({ state: 'error' });
      });
    return (): void => {
      cancelled = true;
    };
  }, [reloadKey, reloadCounter]);

  const plans = phase.state === 'ready' ? phase.data.plans : EMPTY_PLANS;
  const celebMap = phase.state === 'ready' ? phase.data.celebNameByBaseDiet : EMPTY_STR_MAP;
  const dayByDate = useMemo(() => buildCalendar(plans, celebMap), [plans, celebMap]);

  // 선택 날짜의 끼니를 canonical 4 타입으로 필터 + 기둥 순서로 정렬(같은 타입은 원순서 유지).
  const dayMeals = useMemo<DailyMeal[]>(() => {
    const day = dayByDate.get(selectedDate);
    if (day === undefined) return [];
    return day.meals
      .filter((m) => m.meal_type in SLOT_ORDER)
      .sort((a, b) => SLOT_ORDER[a.meal_type] - SLOT_ORDER[b.meal_type]);
  }, [dayByDate, selectedDate]);

  // 날짜 전환 또는 데이터 로드 시 첫 끼니로 리셋(스크롤 top + 기둥 강조 동기화).
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    setActiveMealType(dayMeals.length > 0 ? (dayMeals[0].meal_type as MealSlot) : 'breakfast');
  }, [dayMeals]);

  if (phase.state === 'loading') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text variant="h1" style={styles.screenTitle}>
          Meal Plan
        </Text>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.color.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (phase.state === 'error') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text variant="h1" style={styles.screenTitle}>
          Meal Plan
        </Text>
        <EmptyState
          icon="alert-circle-outline"
          title="식단을 불러오지 못했어요"
          body="잠시 후 다시 시도해주세요."
        />
      </SafeAreaView>
    );
  }

  const { bioPresent, credits, recipeById } = phase.data;
  const remaining = remainingDays(credits);

  // state — 미온보딩: 온보딩 CTA (무료 크레딧 리워드 프레이밍).
  if (!bioPresent) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text variant="h1" style={styles.screenTitle}>
          Meal Plan
        </Text>
        <EmptyState
          icon="leaf-outline"
          title="프로필을 완성하세요"
          body="온보딩을 마치면 무료 식단 크레딧 3개를 드려요. 좋아하는 셀럽의 식단으로 시작해보세요."
          ctaLabel="온보딩하고 크레딧 3개 받기"
          onPressCta={onNavigateOnboarding}
        />
      </SafeAreaView>
    );
  }

  const onGeneratePress = (): void => {
    if (remaining > 0) {
      setSheetVisible(true);
    } else {
      onNavigatePaywall();
    }
  };

  const selectedDay = dayByDate.get(selectedDate) ?? null;
  const dayHasPlan = selectedDay !== null && selectedDay.meals.length > 0;
  const celebName = selectedDay?.celebName ?? null;
  const availableTypes = new Set(dayMeals.map((m) => m.meal_type));

  const tierLabel = (credits?.tier ?? 'free').toUpperCase();
  const creditsLabel =
    credits !== null && credits.credits_total === null
      ? `${tierLabel} · ∞`
      : `${tierLabel} · ${String(remaining)}`;

  const onBodyLayout = (e: LayoutChangeEvent): void => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0 && h !== measuredBody) setMeasuredBody(h);
  };

  // 스냅 정착 시 현재 중앙 끼니로 기둥 강조를 갱신한다(DrumPicker handleSettle 패턴).
  const handleSettle = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    if (dayMeals.length === 0) return;
    const raw = Math.round(e.nativeEvent.contentOffset.y / itemHeight);
    const idx = Math.max(0, Math.min(dayMeals.length - 1, raw));
    setActiveMealType(dayMeals[idx].meal_type as MealSlot);
  };

  const jumpToSlot = (type: MealSlot): void => {
    const idx = dayMeals.findIndex((m) => m.meal_type === type);
    if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true });
  };

  const renderMeal = ({ item }: ListRenderItemInfo<DailyMeal>): React.JSX.Element => {
    const meta = lookupMeta(recipeById, item.recipe_id);
    const mealName = pickMealName(item, meta);
    const label = MEAL_SLOTS.find((s) => s.type === item.meal_type)?.label ?? item.meal_type;
    // adjusted_nutrition(엔진 조정값) 우선, 없으면 recipe 기본 칼로리로 fallback.
    const kcal = item.adjusted_nutrition?.calories ?? meta?.calories ?? 0;
    const kcalText = kcal > 0 ? `${String(Math.round(kcal))} kcal` : null;
    const timeText = formatPrepTime(meta);
    const overview = mealOverview(item, meta);
    return (
      <TouchableOpacity
        onPress={() => {
          onNavigateRecipe?.(item.recipe_id);
        }}
        accessibilityRole="button"
        accessibilityLabel={`View recipe: ${mealName}`}
        activeOpacity={0.85}
        style={[styles.card, { height: itemHeight }]}
      >
        <Text variant="label" tone="muted" style={styles.cardKicker}>
          {label}
        </Text>
        <View style={[styles.cardPhoto, { height: photoHeight }]}>
          <MealPhoto imageUrl={meta?.imageUrl ?? null} name={mealName} fill />
          {/* 소요시간 — 메뉴(사진) 우측 상단 */}
          {timeText !== null ? (
            <View style={styles.timePill}>
              <Ionicons name="time-outline" size={14} color={theme.color.text} />
              <Text variant="caption" tone="default">
                {timeText}
              </Text>
            </View>
          ) : null}
        </View>
        {/* 사진 축소로 확보한 공간 — 이름+칼로리, 그리고 한줄 overview */}
        <View style={styles.cardFooter}>
          <View style={styles.nameRow}>
            <Text variant="h3" numberOfLines={2} style={styles.cardName}>
              {mealName}
            </Text>
            {kcalText !== null ? (
              <Text variant="bodySm" tone="muted" style={styles.kcalBeside}>
                {kcalText}
              </Text>
            ) : null}
          </View>
          {overview !== null ? (
            <Text variant="bodySm" tone="subtle" numberOfLines={2}>
              {overview}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header — 타이틀 + compact 크레딧 + 생성(+) */}
      <View style={styles.header}>
        <Text variant="h1">Meal Plan</Text>
        <View style={styles.headerRight}>
          <Badge label={creditsLabel} tone="neutral" />
          <TouchableOpacity
            onPress={onGeneratePress}
            accessibilityRole="button"
            accessibilityLabel={remaining > 0 ? 'Generate meal plan' : 'Upgrade for credits'}
            style={styles.addBtn}
          >
            <Ionicons name="add" size={22} color={theme.color.onBrand} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 오늘 중앙 5일 스트립 */}
      <View style={styles.weekRow}>
        {week.map((d) => {
          const isSel = d.date === selectedDate;
          const isToday = d.date === todayISO;
          return (
            <TouchableOpacity
              key={d.date}
              onPress={() => {
                setSelectedDate(d.date);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${d.weekday} ${d.dayNum}`}
              accessibilityState={{ selected: isSel }}
              style={styles.weekCell}
            >
              <Text variant="caption" tone={isSel ? 'brand' : 'muted'}>
                {d.weekday}
              </Text>
              <View
                style={[
                  styles.dayCircle,
                  isSel ? styles.dayCircleSelected : isToday ? styles.dayCircleToday : null,
                ]}
              >
                <Text variant="metricMd" tone={isSel ? 'onBrand' : 'default'}>
                  {d.dayNum}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 어느 셀럽 식단 기반인지 — 선택 날짜 plan 의 celeb */}
      {celebName !== null ? (
        <View style={styles.celebRow}>
          <Ionicons name="person-circle-outline" size={18} color={theme.color.brand} />
          <Text variant="bodySm" tone="muted">{`Based on ${celebName}`}</Text>
        </View>
      ) : null}

      {/* 본문: 좌측 meal-type 기둥(인디케이터) + 우측 세로 스냅 스크롤 */}
      {!dayHasPlan ? (
        <View style={styles.bodyEmpty}>
          <EmptyState
            icon="restaurant-outline"
            title="이 날은 아직 식단이 없어요"
            body="셀럽 식단으로 나만의 플랜을 만들어보세요."
            ctaLabel={remaining > 0 ? '식단 만들기' : '크레딧 받기 · 업그레이드'}
            onPressCta={onGeneratePress}
          />
        </View>
      ) : (
        <View style={styles.bodyRow} onLayout={onBodyLayout}>
          <View style={styles.rail}>
            {MEAL_SLOTS.map((slot) => {
              const active = slot.type === activeMealType;
              const available = availableTypes.has(slot.type);
              return (
                <TouchableOpacity
                  key={slot.type}
                  onPress={() => {
                    if (available) jumpToSlot(slot.type);
                  }}
                  disabled={!available}
                  accessibilityRole="button"
                  accessibilityLabel={slot.label}
                  accessibilityState={{ selected: active, disabled: !available }}
                  style={[styles.railItem, !available ? styles.railItemDisabled : null]}
                >
                  <View style={[styles.railIconWrap, active ? styles.railIconWrapActive : null]}>
                    <Ionicons
                      name={slot.icon}
                      size={RAIL_GLYPH}
                      color={active ? theme.color.brand : theme.color.textMuted}
                    />
                  </View>
                  <Text variant="caption" tone={active ? 'brand' : 'muted'}>
                    {slot.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {dayMeals.length === 0 ? (
            <View style={styles.listEmpty}>
              <Text variant="body" tone="muted">
                이 날 식단엔 표시할 끼니가 없어요.
              </Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={dayMeals}
              keyExtractor={(item, index) => `${item.recipe_id}-${String(index)}`}
              renderItem={renderMeal}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              snapToInterval={itemHeight}
              decelerationRate="fast"
              scrollEventThrottle={16}
              getItemLayout={(_, i) => ({ length: itemHeight, offset: itemHeight * i, index: i })}
              onMomentumScrollEnd={handleSettle}
              onScrollEndDrag={handleSettle}
            />
          )}
        </View>
      )}

      <MealPlanGenerateSheet
        visible={sheetVisible}
        maxDays={remaining}
        onClose={() => {
          setSheetVisible(false);
        }}
        onGenerated={() => {
          setSheetVisible(false);
          setReloadCounter((c) => c + 1);
        }}
      />
    </SafeAreaView>
  );
}

const EMPTY_PLANS: schemas.MealPlanWire[] = [];
const EMPTY_STR_MAP: Record<string, string> = {};

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    screenTitle: { paddingHorizontal: theme.space(4), paddingVertical: theme.space(4) },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.space(5),
      gap: theme.space(3),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space(4),
      paddingTop: theme.space(3),
      paddingBottom: theme.space(2),
    },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
    addBtn: {
      width: 36,
      height: 36,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space(4),
      paddingBottom: theme.space(3),
    },
    weekCell: { alignItems: 'center', gap: theme.space(1), flex: 1 },
    dayCircle: {
      width: 46,
      height: 56,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    dayCircleSelected: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
    dayCircleToday: { borderColor: theme.color.brand },
    bodyEmpty: { flex: 1 },
    bodyRow: { flex: 1, flexDirection: 'row', paddingHorizontal: theme.space(3) },
    // 기둥: 본문 높이를 균등 간격으로 채운다(space-between → 4 끼니가 전 높이에 분배).
    rail: {
      width: RAIL_WIDTH,
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: theme.space(2),
    },
    railItem: { alignItems: 'center', gap: theme.space(1), width: RAIL_WIDTH },
    railItemDisabled: { opacity: 0.35 },
    railIconWrap: {
      width: RAIL_BTN,
      height: RAIL_BTN,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
      backgroundColor: theme.color.surface,
    },
    railIconWrapActive: { borderColor: theme.color.brand, backgroundColor: theme.color.brandSubtle },
    list: { flex: 1, marginLeft: theme.space(2) },
    listContent: { paddingBottom: theme.space(4) },
    listEmpty: {
      flex: 1,
      marginLeft: theme.space(2),
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.space(4),
    },
    celebRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(2),
      paddingHorizontal: theme.space(4),
      paddingBottom: theme.space(2),
    },
    card: {},
    cardKicker: { marginBottom: theme.space(1) },
    cardPhoto: { width: '100%', borderRadius: theme.radius.lg, overflow: 'hidden' },
    // 소요시간 pill — 사진 우측 상단 overlay.
    timePill: {
      position: 'absolute',
      top: theme.space(2),
      right: theme.space(2),
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(1),
      paddingVertical: 4,
      paddingHorizontal: theme.space(2),
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.surface,
    },
    // 이름을 사진 바로 아래 붙인다(상단 정렬). 남는 공간은 카드 하단으로.
    cardFooter: { flex: 1, justifyContent: 'flex-start', gap: theme.space(1) },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: theme.space(2),
    },
    cardName: { flex: 1, fontFamily: theme.font.display },
    kcalBeside: { marginTop: 2 },
  });
}
