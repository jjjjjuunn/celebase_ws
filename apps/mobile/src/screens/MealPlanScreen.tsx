// MealPlan — Plan tab 의 root (뉴스-우선 페이오프 화면). 레이아웃:
//   헤더(타이틀 + 크레딧 + '+') → plan 기간 기준 가로 스크롤 날짜 스트립 →
//   본문(세로 스크롤): 하루치 영양 1줄 요약("Inspired by 셀럽·다이어트") + 끼니별 섹션(아침/점심/간식/저녁) 카드.
//
// 뉴스-우선: 생성·크레딧 게이트는 News claim "Make my Plan" CTA 로 이동 → 본 화면의 '+'/빈상태는
//   News 로 안내(onNavigateNews). 셀럽 grid 생성 시트는 제거됐다.
//
// 데이터(한 reload 에서 병렬 fetch): bio-profile(온보딩 여부) · credits(잔량) · plans(목록).
// 날짜 스트립: daily_plans 가 있고 end_date≥오늘 인 plan 들의 [min(start,오늘)…max(end,오늘)] 연속 범위
//   (완전 과거 plan 은 sparse 방지로 제외). 오늘 항상 포함 · 기본 선택=오늘.
//
// 네비게이션은 prop 콜백으로 주입(PlanNavigator) — 화면은 nav 비의존(테스트 용이).

import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { schemas, MacroRatio } from '@celebbase/shared-types';

import { MealPhoto } from '../components/MealPhoto';
import { ApiError } from '../lib/api-client';
import { getBioProfile } from '../services/bio-profile';
import { getBaseDiet, listCelebrities } from '../services/celebrities';
import { getMealPlanCredits, listMyMealPlans } from '../services/meal-plans';
import { getRecipesByIds } from '../services/recipes';
import { Badge, EmptyState, Text, useTheme, type Theme } from '../ui';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface MealPlanScreenProps {
  onNavigateOnboarding: () => void;
  /** '+' / 빈상태 → News 퍼널(claim 에서 생성). PlanNavigator 주입. */
  onNavigateNews: () => void;
  /** 끼니 카드 탭 → recipe 상세. PlanNavigator 가 주입(선택적 — 테스트는 미주입). */
  onNavigateRecipe?: (recipeId: string) => void;
  /** PlanNavigator focus refresh 트리거 — 값이 바뀌면 전체 reload. */
  reloadKey?: number;
  /** claim 생성 직후 착지 토큰(새 plan id). 로드 완료 후 그 plan 의 start_date 를 선택(레이스 가드). */
  focusPlanId?: string;
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
  dietNameByBaseDiet: Record<string, string>;
  recipeById: Record<string, RecipeMeta>;
}

type Phase = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: ScreenData };

type DailyMeal = schemas.MealPlanWire['daily_plans'][number]['meals'][number];
type DailyTotals = schemas.MealPlanWire['daily_plans'][number]['daily_totals'];

interface CalendarDay {
  date: string;
  celebName: string | null;
  dietName: string | null;
  meals: DailyMeal[];
  dailyTotals: DailyTotals;
}

// 좌측 기둥 시절의 고정 4 끼니(아침·점심·간식·저녁) — 이제 본문 섹션 헤더 순서로 쓰인다.
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// 날짜 셀 폭(getItemLayout/scroll 용 고정값).
const CELL_W = 56;
// 끼니 카드 사진 높이(고정 — 화면 reflow 없음).
const PHOTO_H = 150;

function toISODate(d: Date): string {
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 'YYYY-MM-DD' → local Date(자정). toISOString 의 UTC shift 회피.
function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

interface DateCell {
  date: string;
  weekday: string;
  dayNum: string;
  isToday: boolean;
}

// 날짜 스트립: daily_plans 가 있고 end_date≥오늘 인 plan 의 날짜 범위를 오늘과 합쳐 연속 셀로.
// 완전 과거 plan 은 제외(오래된 plan 으로 strip 이 sparse 해지는 것 방지). 오늘은 항상 포함.
function buildDateStrip(plans: schemas.MealPlanWire[], todayISO: string): DateCell[] {
  const relevant = plans.filter(
    (p) => p.status !== 'failed' && p.daily_plans.length > 0 && p.end_date >= todayISO,
  );
  let startISO = todayISO;
  let endISO = todayISO;
  for (const p of relevant) {
    if (p.start_date < startISO) startISO = p.start_date;
    if (p.end_date > endISO) endISO = p.end_date;
  }
  const cells: DateCell[] = [];
  const end = parseISODate(endISO);
  const cursor = parseISODate(startISO);
  while (cursor <= end) {
    const iso = toISODate(cursor);
    cells.push({
      date: iso,
      weekday: WEEKDAYS[cursor.getDay()],
      dayNum: String(cursor.getDate()),
      isToday: iso === todayISO,
    });
    cursor.setDate(cursor.getDate() + 1);
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

  const [info, recipeById] = await Promise.all([
    resolveBaseDietInfo(plans),
    resolveRecipes(plans),
  ]);
  return {
    bioPresent,
    credits,
    plans,
    celebNameByBaseDiet: info.celebNameByBaseDiet,
    dietNameByBaseDiet: info.dietNameByBaseDiet,
    recipeById,
  };
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

// base_diet_id → 셀럽 display_name + 다이어트 name 로컬 조인 (rule #10: content-service 소유 데이터).
// distinct base_diet_id 만 조회(plan 수 기준 bound). best-effort — 실패 시 해당 base_diet 생략.
async function resolveBaseDietInfo(
  plans: schemas.MealPlanWire[],
): Promise<{
  celebNameByBaseDiet: Record<string, string>;
  dietNameByBaseDiet: Record<string, string>;
}> {
  const baseDietIds = Array.from(new Set(plans.map((p) => p.base_diet_id)));
  if (baseDietIds.length === 0) return { celebNameByBaseDiet: {}, dietNameByBaseDiet: {} };

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
  const celebNameByBaseDiet: Record<string, string> = {};
  const dietNameByBaseDiet: Record<string, string> = {};
  for (const bd of baseDiets) {
    if (bd === null) continue;
    const name = nameByCelebId.get(bd.celebrity_id);
    if (name !== undefined) celebNameByBaseDiet[bd.id] = name;
    dietNameByBaseDiet[bd.id] = bd.name;
  }
  return { celebNameByBaseDiet, dietNameByBaseDiet };
}

function buildCalendar(
  plans: schemas.MealPlanWire[],
  celebNameByBaseDiet: Record<string, string>,
  dietNameByBaseDiet: Record<string, string>,
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
        celebName: celebNameByBaseDiet[plan.base_diet_id] ?? null,
        dietName: dietNameByBaseDiet[plan.base_diet_id] ?? null,
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

// recipe_id 조회 — 미해석(undefined) 케이스를 함수 경계에서 명시한다.
function lookupMeta(recipeById: Record<string, RecipeMeta>, id: string): RecipeMeta | undefined {
  return recipeById[id];
}

/** prep + cook 분 합. 미상이면 null(미표시). */
function formatPrepTime(meta?: RecipeMeta): string | null {
  if (meta === undefined) return null;
  const total = (meta.prepTimeMin ?? 0) + (meta.cookTimeMin ?? 0);
  return total > 0 ? `${String(total)} min` : null;
}

/** 메뉴 한줄 overview — recipe description 우선, 없으면 meal.narrative. ≤7 단어. */
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

/** 선택 날짜 라벨 — 오늘이면 'Today', 아니면 'Wed 7'. */
function labelForDate(dateISO: string, todayISO: string): string {
  if (dateISO === todayISO) return 'Today';
  const d = parseISODate(dateISO);
  return `${WEEKDAYS[d.getDay()]} ${String(d.getDate())}`;
}

export function MealPlanScreen({
  onNavigateOnboarding,
  onNavigateNews,
  onNavigateRecipe,
  reloadKey = 0,
  focusPlanId,
}: MealPlanScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [phase, setPhase] = useState<Phase>({ state: 'loading' });

  const today = useMemo(() => new Date(), []);
  const todayISO = useMemo(() => toISODate(today), [today]);
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);

  // focusPlanId 토큰을 1회만 적용(이후 phase 변경에 재적용 안 함 — 사용자가 날짜를 옮길 수 있게).
  const appliedFocusRef = useRef<string | undefined>(undefined);
  const stripRef = useRef<FlatList<DateCell>>(null);
  const stripScrolledRef = useRef(false);

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
  }, [reloadKey]);

  const plans = phase.state === 'ready' ? phase.data.plans : EMPTY_PLANS;
  const celebMap = phase.state === 'ready' ? phase.data.celebNameByBaseDiet : EMPTY_STR_MAP;
  const dietMap = phase.state === 'ready' ? phase.data.dietNameByBaseDiet : EMPTY_STR_MAP;
  const dayByDate = useMemo(
    () => buildCalendar(plans, celebMap, dietMap),
    [plans, celebMap, dietMap],
  );
  const strip = useMemo(() => buildDateStrip(plans, todayISO), [plans, todayISO]);

  // focusPlanId(claim 생성 직후): reload 가 끝나 plans 에 새 plan 이 들어온 뒤에만 적용(레이스 가드).
  // phase 가 deps 라 로드 완료 시 재실행되어, fetch in-flight 중 미적용 → 완료 후 적용된다.
  useEffect(() => {
    if (focusPlanId === undefined) return;
    if (phase.state !== 'ready') return;
    if (appliedFocusRef.current === focusPlanId) return;
    const plan = phase.data.plans.find((p) => p.id === focusPlanId);
    if (plan === undefined) return; // 아직 로드 안 됨(reload 진행중) — 완료 후 재실행 시 적용.
    appliedFocusRef.current = focusPlanId;
    setSelectedDate(plan.start_date);
  }, [focusPlanId, phase]);

  // 선택 날짜의 끼니를 canonical 4 타입으로 필터 + 슬롯 순서로 정렬.
  const dayMeals = useMemo<DailyMeal[]>(() => {
    const day = dayByDate.get(selectedDate);
    if (day === undefined) return [];
    return day.meals
      .filter((m) => m.meal_type in SLOT_ORDER)
      .sort((a, b) => SLOT_ORDER[a.meal_type] - SLOT_ORDER[b.meal_type]);
  }, [dayByDate, selectedDate]);

  // 선택 셀이 화면에 보이도록 strip 스크롤(마운트=무애니, 이후=애니).
  const selectedIndex = useMemo(
    () => strip.findIndex((c) => c.date === selectedDate),
    [strip, selectedDate],
  );
  useEffect(() => {
    if (selectedIndex < 0) return;
    stripRef.current?.scrollToIndex({
      index: selectedIndex,
      animated: stripScrolledRef.current,
      viewPosition: 0.5,
    });
    stripScrolledRef.current = true;
  }, [selectedIndex]);

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

  // 미온보딩: 온보딩 CTA (무료 크레딧 리워드 프레이밍).
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

  const selectedDay = dayByDate.get(selectedDate) ?? null;
  const dayHasPlan = selectedDay !== null && selectedDay.meals.length > 0;

  const tierLabel = (credits?.tier ?? 'free').toUpperCase();
  const creditsLabel =
    credits !== null && credits.credits_total === null
      ? `${tierLabel} · ∞`
      : `${tierLabel} · ${String(remaining)}`;

  const renderDateCell = ({ item }: ListRenderItemInfo<DateCell>): React.JSX.Element => {
    const isSel = item.date === selectedDate;
    const hasPlan = dayByDate.has(item.date);
    return (
      <TouchableOpacity
        onPress={() => {
          setSelectedDate(item.date);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${item.weekday} ${item.dayNum}`}
        accessibilityState={{ selected: isSel }}
        style={styles.dateCell}
      >
        <Text variant="caption" tone={isSel ? 'brand' : 'muted'}>
          {item.weekday}
        </Text>
        <View
          style={[
            styles.dayCircle,
            isSel ? styles.dayCircleSelected : item.isToday ? styles.dayCircleToday : null,
          ]}
        >
          <Text variant="metricMd" tone={isSel ? 'onBrand' : 'default'}>
            {item.dayNum}
          </Text>
        </View>
        <View style={[styles.planDot, hasPlan ? styles.planDotOn : null]} />
      </TouchableOpacity>
    );
  };

  const renderMealCard = (item: DailyMeal): React.JSX.Element => {
    const meta = lookupMeta(recipeById, item.recipe_id);
    const mealName = pickMealName(item, meta);
    const kcal = item.adjusted_nutrition?.calories ?? meta?.calories ?? 0;
    const kcalText = kcal > 0 ? `${String(Math.round(kcal))} kcal` : null;
    const timeText = formatPrepTime(meta);
    const metaText = [kcalText, timeText].filter((t): t is string => t !== null).join(' · ');
    const overview = mealOverview(item, meta);
    return (
      <TouchableOpacity
        key={item.recipe_id}
        onPress={() => {
          onNavigateRecipe?.(item.recipe_id);
        }}
        accessibilityRole="button"
        accessibilityLabel={`View recipe: ${mealName}`}
        activeOpacity={0.85}
        style={styles.card}
      >
        <View style={styles.cardPhoto}>
          <MealPhoto imageUrl={meta?.imageUrl ?? null} name={mealName} fill />
        </View>
        <Text variant="h3" numberOfLines={2} style={styles.cardName}>
          {mealName}
        </Text>
        {metaText !== '' ? (
          <Text variant="bodySm" tone="muted">
            {metaText}
          </Text>
        ) : null}
        {overview !== null ? (
          <Text variant="bodySm" tone="subtle" numberOfLines={1}>
            {overview}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header — 타이틀 + compact 크레딧 + '+'(News 퍼널) */}
      <View style={styles.header}>
        <Text variant="h1">Meal Plan</Text>
        <View style={styles.headerRight}>
          <Badge label={creditsLabel} tone="neutral" />
          <TouchableOpacity
            onPress={onNavigateNews}
            accessibilityRole="button"
            accessibilityLabel="Make a meal plan from News"
            style={styles.addBtn}
          >
            <Ionicons name="add" size={22} color={theme.color.onBrand} />
          </TouchableOpacity>
        </View>
      </View>

      {/* plan 기간 기준 가로 스크롤 날짜 스트립 */}
      <FlatList
        ref={stripRef}
        data={strip}
        keyExtractor={(item) => item.date}
        renderItem={renderDateCell}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}
        getItemLayout={(_, i) => ({ length: CELL_W, offset: CELL_W * i, index: i })}
        onScrollToIndexFailed={(info) => {
          stripRef.current?.scrollToOffset({ offset: CELL_W * info.index, animated: false });
        }}
      />

      {!dayHasPlan ? (
        <View style={styles.bodyEmpty}>
          <EmptyState
            icon="restaurant-outline"
            title="이 날은 아직 식단이 없어요"
            body="News 에서 셀럽 스토리를 골라 나만의 식단을 만들어보세요."
            ctaLabel="News 에서 식단 만들기"
            onPressCta={onNavigateNews}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 하루치 영양 1줄 요약 + 셀럽/다이어트 attribution */}
          <DaySummary
            theme={theme}
            styles={styles}
            dayLabel={labelForDate(selectedDate, todayISO)}
            celebName={selectedDay.celebName}
            dietName={selectedDay.dietName}
            dailyTotals={selectedDay.dailyTotals}
          />

          {/* 끼니별 섹션 — 끼니가 있는 슬롯만 헤더 + 카드 */}
          {MEAL_SLOTS.map((slot) => {
            const meals = dayMeals.filter((m) => m.meal_type === slot.type);
            if (meals.length === 0) return null;
            return (
              <View key={slot.type} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name={slot.icon} size={16} color={theme.color.brand} />
                  <Text variant="label" tone="muted" style={styles.sectionLabel}>
                    {slot.label.toUpperCase()}
                  </Text>
                </View>
                {meals.map((m) => renderMealCard(m))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const EMPTY_PLANS: schemas.MealPlanWire[] = [];
const EMPTY_STR_MAP: Record<string, string> = {};

// ── 하루치 영양 요약 (셀럽 vs 나 비교 패널을 대체 — 유저 daily_totals 만 정직하게) ──────────

/**
 * 유저 plan 의 daily_totals(grams) → macro % 환산. 총합 0(엔진 미충전)이면 null → 막대 생략.
 * 독립 반올림 합이 99/101 이 될 수 있어 largest-remainder 로 합 100 정규화.
 */
function toUserMacroPct(dt: DailyTotals): MacroRatio | null {
  const cals = [dt.protein_g * 4, dt.carbs_g * 4, dt.fat_g * 9];
  const tot = cals[0] + cals[1] + cals[2];
  if (tot <= 0) return null;
  const exact = cals.map((x) => (x / tot) * 100);
  const pct = exact.map((x) => Math.floor(x));
  let deficit = 100 - (pct[0] + pct[1] + pct[2]);
  const byRemainderDesc = [0, 1, 2].sort((a, b) => exact[b] - pct[b] - (exact[a] - pct[a]));
  for (let i = 0; i < byRemainderDesc.length && deficit > 0; i += 1) {
    pct[byRemainderDesc[i]] += 1;
    deficit -= 1;
  }
  return { protein_pct: pct[0], carbs_pct: pct[1], fat_pct: pct[2] };
}

/** 1234 → "1,234" (Hermes Intl 비의존 — 천단위 콤마). */
function formatThousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function DaySummary({
  theme,
  styles,
  dayLabel,
  celebName,
  dietName,
  dailyTotals,
}: {
  theme: Theme;
  styles: ReturnType<typeof makeStyles>;
  dayLabel: string;
  celebName: string | null;
  dietName: string | null;
  dailyTotals: DailyTotals;
}): React.JSX.Element {
  const userMacro = toUserMacroPct(dailyTotals);
  const inspired =
    celebName !== null
      ? `Inspired by ${celebName}${dietName !== null ? ` · ${dietName}` : ''}`
      : dietName;
  return (
    <View style={styles.summary}>
      <Text variant="label" tone="muted">
        {dayLabel}
      </Text>
      <Text variant="metricLg" style={styles.summaryKcal}>
        {`${formatThousands(dailyTotals.calories)} kcal`}
      </Text>
      {userMacro !== null ? (
        <>
          <Text variant="caption" tone="subtle">
            {`P ${String(userMacro.protein_pct)} · C ${String(userMacro.carbs_pct)} · F ${String(userMacro.fat_pct)}`}
          </Text>
          <View
            style={styles.bar}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View style={[styles.barSeg, { flex: userMacro.protein_pct, backgroundColor: theme.accents[0] }]} />
            <View style={[styles.barSeg, { flex: userMacro.carbs_pct, backgroundColor: theme.accents[1] }]} />
            <View style={[styles.barSeg, { flex: userMacro.fat_pct, backgroundColor: theme.accents[2] }]} />
          </View>
        </>
      ) : null}
      {inspired !== null ? (
        <View style={styles.inspiredRow}>
          <Ionicons name="person-circle-outline" size={16} color={theme.color.brand} />
          <Text variant="caption" tone="muted">
            {inspired}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

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
    strip: { flexGrow: 0 },
    stripContent: { paddingHorizontal: theme.space(3), paddingBottom: theme.space(2) },
    dateCell: { width: CELL_W, alignItems: 'center', gap: theme.space(1) },
    dayCircle: {
      width: 44,
      height: 52,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    dayCircleSelected: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
    dayCircleToday: { borderColor: theme.color.brand },
    planDot: { width: 5, height: 5, borderRadius: theme.radius.pill, backgroundColor: 'transparent' },
    planDotOn: { backgroundColor: theme.color.brand },
    bodyEmpty: { flex: 1 },
    body: { flex: 1 },
    bodyContent: { paddingHorizontal: theme.space(4), paddingBottom: theme.space(6), gap: theme.space(4) },
    // 하루치 영양 요약 카드
    summary: {
      padding: theme.space(4),
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.surface,
      gap: theme.space(1),
    },
    summaryKcal: { fontFamily: theme.font.display },
    bar: {
      flexDirection: 'row',
      height: 6,
      borderRadius: theme.radius.pill,
      overflow: 'hidden',
      marginTop: theme.space(1),
    },
    barSeg: { height: '100%' },
    inspiredRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(1), marginTop: theme.space(1) },
    // 끼니 섹션
    section: { gap: theme.space(2) },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.space(1) },
    sectionLabel: { letterSpacing: 0.5 },
    card: { gap: theme.space(1) },
    cardPhoto: { width: '100%', height: PHOTO_H, borderRadius: theme.radius.lg, overflow: 'hidden' },
    cardName: { fontFamily: theme.font.display },
  });
}
