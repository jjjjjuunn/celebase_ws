// MealPlan — Plan tab 의 root. 크레딧 기반 식단 생성 게이트 + 날짜별 캘린더.
//
// 데이터(한 reload 에서 병렬 fetch): bio-profile(온보딩 여부) · credits(잔량) · plans(목록).
// 3-state 게이트:
//   1. !bioPresent          → 온보딩 CTA (무료 크레딧 리워드 프레이밍)
//   2. bioPresent + remaining>0 → credits 헤더 + [식단 만들기] → 생성 시트
//   3. bioPresent + remaining===0 → credits 헤더 + [업그레이드] → Paywall
// 캘린더: 모든 non-failed plan 의 daily_plans 를 날짜맵으로(최신 plan 우선) → 날짜 strip +
//   선택일 상세(셀럽명은 base_diet_id→celebrity 로컬 조인, meal 리스트).
//
// 네비게이션은 prop 콜백으로 주입(PlanNavigator) — 화면은 nav 비의존(테스트 용이).

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { schemas } from '@celebbase/shared-types';

import { MealPlanGenerateSheet } from '../components/MealPlanGenerateSheet';
import { ApiError } from '../lib/api-client';
import { getBioProfile } from '../services/bio-profile';
import { getBaseDiet, listCelebrities } from '../services/celebrities';
import { getMealPlanCredits, listMyMealPlans } from '../services/meal-plans';
import { getRecipesByIds } from '../services/recipes';
import { Badge, Button, Card, EmptyState, Text, useTheme, type Theme } from '../ui';

interface MealPlanScreenProps {
  onNavigateOnboarding: () => void;
  onNavigatePaywall: () => void;
  /** PlanNavigator focus refresh 트리거 — 값이 바뀌면 전체 reload. */
  reloadKey?: number;
}

interface ScreenData {
  bioPresent: boolean;
  credits: schemas.MealPlanCreditsResponse | null;
  plans: schemas.MealPlanWire[];
  celebNameByBaseDiet: Record<string, string>;
  recipeTitleById: Record<string, string>;
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

  const [celebNameByBaseDiet, recipeTitleById] = await Promise.all([
    resolveCelebNames(plans),
    resolveRecipeTitles(plans),
  ]);
  return { bioPresent, credits, plans, celebNameByBaseDiet, recipeTitleById };
}

// recipe_id → 사람이 읽는 제목 로컬 조인 (rule #10: content-service 소유 데이터).
// non-failed plan 의 distinct recipe_id 만 batch 조회. best-effort — 실패 시 제목 생략.
async function resolveRecipeTitles(
  plans: schemas.MealPlanWire[],
): Promise<Record<string, string>> {
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

  const map: Record<string, string> = {};
  for (const r of res.recipes) map[r.id] = r.title;
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
): CalendarDay[] {
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
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** credits 잔량 → 생성 가능 일수. null(fetch 실패)=0, unlimited override=무제한(7). */
function remainingDays(credits: schemas.MealPlanCreditsResponse | null): number {
  if (credits === null) return 0;
  if (credits.credits_remaining === null) return 7; // unlimited override
  return credits.credits_remaining;
}

export function MealPlanScreen({
  onNavigateOnboarding,
  onNavigatePaywall,
  reloadKey = 0,
}: MealPlanScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [phase, setPhase] = useState<Phase>({ state: 'loading' });
  const [reloadCounter, setReloadCounter] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
  const celebMap = phase.state === 'ready' ? phase.data.celebNameByBaseDiet : EMPTY_MAP;
  const calendar = useMemo(() => buildCalendar(plans, celebMap), [plans, celebMap]);

  // 선택 날짜 기본값/유지 — refetch flicker(ready→loading→ready) 동안 선택이 초기화되지
  // 않도록 ready 일 때만 갱신하고, 기존 선택이 여전히 유효하면 그대로 둔다(default snap-back 방지).
  useEffect(() => {
    if (phase.state !== 'ready') return;
    if (calendar.length === 0) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate((prev) => {
      if (prev !== null && calendar.some((d) => d.date === prev)) return prev;
      const today = new Date().toISOString().slice(0, 10);
      return calendar.some((d) => d.date === today) ? today : calendar[0].date;
    });
  }, [calendar, phase.state]);

  if (phase.state === 'loading') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text variant="h1" style={styles.screenTitle}>
          Your Plan
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
          Your Plan
        </Text>
        <EmptyState
          icon="alert-circle-outline"
          title="식단을 불러오지 못했어요"
          body="잠시 후 다시 시도해주세요."
        />
      </SafeAreaView>
    );
  }

  const { bioPresent, credits, recipeTitleById } = phase.data;
  const remaining = remainingDays(credits);

  // state 1 — 미온보딩: 온보딩 CTA (무료 크레딧 리워드 프레이밍).
  if (!bioPresent) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text variant="h1" style={styles.screenTitle}>
          Your Plan
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

  const selectedDay = calendar.find((d) => d.date === selectedDate) ?? null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text variant="h1" style={styles.screenTitle}>
        Your Plan
      </Text>

      <ScrollView contentContainerStyle={styles.body}>
        <CreditsHeader credits={credits} remaining={remaining} />

        <View style={styles.ctaWrap}>
          {remaining > 0 ? (
            <Button
              label="+ 식단 만들기"
              accessibilityLabel="Open generate sheet"
              onPress={() => {
                setSheetVisible(true);
              }}
            />
          ) : (
            <Button
              label="크레딧 받기 · 업그레이드"
              accessibilityLabel="Upgrade for credits"
              onPress={onNavigatePaywall}
            />
          )}
        </View>

        {calendar.length === 0 ? (
          <Text variant="body" tone="muted" style={styles.emptyHint}>
            아직 식단이 없어요. 위에서 만들어보세요.
          </Text>
        ) : (
          <>
            <DateStrip
              days={calendar}
              selectedDate={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date);
              }}
            />
            {selectedDay !== null ? (
              <DayDetail day={selectedDay} recipeTitleById={recipeTitleById} />
            ) : null}
          </>
        )}
      </ScrollView>

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
const EMPTY_MAP: Record<string, string> = {};

interface CreditsHeaderProps {
  credits: schemas.MealPlanCreditsResponse | null;
  remaining: number;
}

function CreditsHeader({ credits, remaining }: CreditsHeaderProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tierLabel = credits?.tier ?? 'free';
  const unlimited = credits !== null && credits.credits_total === null;
  const resetAt = credits?.credits_reset_at ?? null;

  // Dark "ink" feature card (reference Profile/Plan hero cards): the credit
  // balance is the screen's headline number → ink surface + gold metric + cream
  // supporting text reads as the premium "wow" moment.
  return (
    <Card variant="surface" style={[styles.creditsCard, styles.creditsCardDark]}>
      <View style={styles.creditsRow}>
        <Badge label={tierLabel.toUpperCase()} tone="subtle" />
        {unlimited ? (
          <Text variant="h4" style={{ color: theme.color.onInk }}>
            무제한
          </Text>
        ) : (
          <View style={styles.creditsCount}>
            <Text variant="metricLg" style={{ color: theme.color.gold }}>
              {String(remaining)}
            </Text>
            <Text variant="bodySm" style={[styles.creditsSuffix, styles.onDark]}>
              {`/ ${String(credits?.credits_total ?? 0)} 크레딧`}
            </Text>
          </View>
        )}
      </View>
      <Text variant="caption" style={styles.onDark}>
        {resetAt !== null ? `다음 리셋: ${resetAt.slice(0, 10)}` : '온보딩 무료 크레딧 (1회성)'}
      </Text>
    </Card>
  );
}

interface DateStripProps {
  days: CalendarDay[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
}

function DateStrip({ days, selectedDate, onSelect }: DateStripProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.dateStrip}
    >
      {days.map((d) => {
        const isSel = d.date === selectedDate;
        return (
          <TouchableOpacity
            key={d.date}
            onPress={() => {
              onSelect(d.date);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Day ${d.date}`}
            accessibilityState={{ selected: isSel }}
            style={[styles.datePill, isSel ? styles.datePillSelected : styles.datePillUnselected]}
          >
            <Text variant="metricSm" tone={isSel ? 'brand' : 'default'} style={styles.datePillDate}>
              {d.date.slice(5)}
            </Text>
            {d.celebName !== null ? (
              <Text variant="caption" tone="muted" numberOfLines={1} style={styles.datePillCeleb}>
                {d.celebName}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function DayDetail({
  day,
  recipeTitleById,
}: {
  day: CalendarDay;
  recipeTitleById: Record<string, string>;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.detail}>
      <Card variant="subtle" style={styles.planHeaderCard}>
        <Text variant="h3" tone="brand">
          {day.celebName ?? 'My Plan'}
        </Text>
        <Text variant="metricSm" tone="muted">
          {day.date}
        </Text>
        <View style={styles.macrosRow}>
          <MacroBox label="kcal" value={String(Math.round(day.dailyTotals.calories))} />
          <MacroBox label="P" value={`${String(Math.round(day.dailyTotals.protein_g))}g`} />
          <MacroBox label="C" value={`${String(Math.round(day.dailyTotals.carbs_g))}g`} />
          <MacroBox label="F" value={`${String(Math.round(day.dailyTotals.fat_g))}g`} />
        </View>
      </Card>

      <Text variant="label" tone="muted" style={styles.sectionTitle}>
        Meals
      </Text>
      {day.meals.length === 0 ? (
        <Text variant="body" tone="muted" style={styles.emptyHint}>
          No meals scheduled.
        </Text>
      ) : (
        day.meals.map((meal, idx) => (
          <MealCard
            key={`${meal.meal_type}-${String(idx)}`}
            meal={meal}
            title={recipeTitleById[meal.recipe_id]}
          />
        ))
      )}
    </View>
  );
}

function MacroBox({ label, value }: { label: string; value: string }): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.macroBox}>
      <Text variant="metricMd">{value}</Text>
      <Text variant="caption" tone="muted" style={styles.macroLabel}>
        {label}
      </Text>
    </View>
  );
}

function MealCard({ meal, title }: { meal: DailyMeal; title?: string }): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const kcal = meal.adjusted_nutrition?.calories;
  // 우선순위: 해석된 레시피 제목 → narrative(LLM 설명) → recipe_id placeholder.
  const mealName =
    title != null && title !== ''
      ? title
      : meal.narrative != null && meal.narrative !== ''
        ? meal.narrative
        : `Recipe #${meal.recipe_id.slice(0, 8)}`;
  return (
    <Card variant="surface" style={styles.mealCard}>
      <View style={styles.mealHeader}>
        <Text variant="label" tone="brand">
          {capitalize(meal.meal_type)}
        </Text>
        {typeof kcal === 'number' ? (
          <Text variant="metricSm" tone="muted">
            {`${String(Math.round(kcal))} kcal`}
          </Text>
        ) : null}
      </View>
      <Text variant="body">{mealName}</Text>
    </Card>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    screenTitle: { paddingHorizontal: theme.space(4), paddingVertical: theme.space(4) },
    body: { paddingBottom: theme.space(5) },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.space(5),
      gap: theme.space(3),
    },
    ctaWrap: { paddingHorizontal: theme.space(4), paddingBottom: theme.space(3) },
    emptyHint: { paddingHorizontal: theme.space(4) },
    creditsCard: {
      marginHorizontal: theme.space(4),
      marginTop: theme.space(4),
      marginBottom: theme.space(3),
      gap: theme.space(2),
    },
    creditsCardDark: { backgroundColor: theme.color.ink },
    creditsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    creditsCount: { flexDirection: 'row', alignItems: 'baseline', gap: theme.space(1) },
    creditsSuffix: { paddingBottom: 2 },
    onDark: { color: theme.color.onInk, opacity: 0.7 },
    dateStrip: {
      paddingHorizontal: theme.space(4),
      gap: theme.space(2),
      paddingBottom: theme.space(3),
    },
    datePill: {
      minWidth: 64,
      paddingVertical: theme.space(2),
      paddingHorizontal: theme.space(3),
      borderRadius: theme.radius.md,
      alignItems: 'center',
      borderWidth: 2,
      gap: 2,
    },
    datePillSelected: {
      borderColor: theme.color.brand,
      backgroundColor: theme.color.brandSubtle,
    },
    datePillUnselected: { borderColor: 'transparent', backgroundColor: theme.color.surface },
    datePillDate: { fontWeight: '700' },
    datePillCeleb: { maxWidth: 72 },
    detail: { paddingTop: theme.space(2) },
    planHeaderCard: {
      marginHorizontal: theme.space(4),
      marginBottom: theme.space(3),
      gap: theme.space(1),
    },
    macrosRow: { flexDirection: 'row', gap: theme.space(3), marginTop: theme.space(3) },
    macroBox: {
      flex: 1,
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.sm,
      paddingVertical: theme.space(2),
      alignItems: 'center',
    },
    macroLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
    sectionTitle: {
      paddingHorizontal: theme.space(4),
      paddingBottom: theme.space(2),
    },
    mealCard: {
      marginHorizontal: theme.space(4),
      marginBottom: theme.space(2),
      gap: theme.space(1),
    },
    mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  });
}
