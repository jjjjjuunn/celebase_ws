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
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@celebbase/design-tokens';
import type { schemas } from '@celebbase/shared-types';

import { MealPlanGenerateSheet } from '../components/MealPlanGenerateSheet';
import { ApiError } from '../lib/api-client';
import { px, resolveToken } from '../lib/tokens';
import { getBioProfile } from '../services/bio-profile';
import { getBaseDiet, listCelebrities } from '../services/celebrities';
import { getMealPlanCredits, listMyMealPlans } from '../services/meal-plans';

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

  const celebNameByBaseDiet = await resolveCelebNames(plans);
  return { bioPresent, credits, plans, celebNameByBaseDiet };
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
      <SafeAreaView style={styles.container}>
        <Text style={styles.screenTitle}>Your Plan</Text>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={resolveToken('light', '--cb-color-brand')} />
        </View>
      </SafeAreaView>
    );
  }

  if (phase.state === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.screenTitle}>Your Plan</Text>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Couldn't load your plan.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { bioPresent, credits } = phase.data;
  const remaining = remainingDays(credits);

  // state 1 — 미온보딩: 온보딩 CTA (무료 크레딧 리워드 프레이밍).
  if (!bioPresent) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.screenTitle}>Your Plan</Text>
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🥗</Text>
          <Text style={styles.emptyTitle}>프로필을 완성하세요</Text>
          <Text style={styles.emptyBody}>
            온보딩을 마치면 무료 식단 크레딧 3개를 드려요. 좋아하는 셀럽의 식단으로 시작해보세요.
          </Text>
          <TouchableOpacity
            onPress={onNavigateOnboarding}
            accessibilityRole="button"
            accessibilityLabel="Start onboarding"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>온보딩하고 크레딧 3개 받기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const selectedDay = calendar.find((d) => d.date === selectedDate) ?? null;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.screenTitle}>Your Plan</Text>

      <ScrollView contentContainerStyle={styles.body}>
        <CreditsHeader credits={credits} remaining={remaining} />

        {remaining > 0 ? (
          <TouchableOpacity
            onPress={() => {
              setSheetVisible(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Open generate sheet"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>+ 식단 만들기</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onNavigatePaywall}
            accessibilityRole="button"
            accessibilityLabel="Upgrade for credits"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>크레딧 받기 · 업그레이드</Text>
          </TouchableOpacity>
        )}

        {calendar.length === 0 ? (
          <Text style={styles.bodyText}>아직 식단이 없어요. 위에서 만들어보세요.</Text>
        ) : (
          <>
            <DateStrip
              days={calendar}
              selectedDate={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date);
              }}
            />
            {selectedDay !== null ? <DayDetail day={selectedDay} /> : null}
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
  const tierLabel = credits?.tier ?? 'free';
  const unlimited = credits !== null && credits.credits_total === null;
  const totalLabel = unlimited ? '무제한' : `${String(remaining)} / ${String(credits?.credits_total ?? 0)}`;
  const resetAt = credits?.credits_reset_at ?? null;

  return (
    <View style={styles.creditsCard}>
      <View style={styles.creditsRow}>
        <Text style={styles.creditsTier}>{tierLabel.toUpperCase()}</Text>
        <Text style={styles.creditsValue}>{unlimited ? '무제한' : `${totalLabel} 크레딧`}</Text>
      </View>
      {resetAt !== null ? (
        <Text style={styles.creditsReset}>다음 리셋: {resetAt.slice(0, 10)}</Text>
      ) : (
        <Text style={styles.creditsReset}>온보딩 무료 크레딧 (1회성)</Text>
      )}
    </View>
  );
}

interface DateStripProps {
  days: CalendarDay[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
}

function DateStrip({ days, selectedDate, onSelect }: DateStripProps): React.JSX.Element {
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
            <Text style={isSel ? styles.datePillTextSelected : styles.datePillText}>
              {d.date.slice(5)}
            </Text>
            {d.celebName !== null ? (
              <Text style={styles.datePillCeleb} numberOfLines={1}>
                {d.celebName}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function DayDetail({ day }: { day: CalendarDay }): React.JSX.Element {
  return (
    <View style={styles.detail}>
      <View style={styles.planHeaderCard}>
        <Text style={styles.planName}>{day.celebName ?? 'My Plan'}</Text>
        <Text style={styles.planDates}>{day.date}</Text>
        <View style={styles.macrosRow}>
          <MacroBox label="kcal" value={String(Math.round(day.dailyTotals.calories))} />
          <MacroBox label="P" value={`${String(Math.round(day.dailyTotals.protein_g))}g`} />
          <MacroBox label="C" value={`${String(Math.round(day.dailyTotals.carbs_g))}g`} />
          <MacroBox label="F" value={`${String(Math.round(day.dailyTotals.fat_g))}g`} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Meals</Text>
      {day.meals.length === 0 ? (
        <Text style={styles.bodyText}>No meals scheduled.</Text>
      ) : (
        day.meals.map((meal, idx) => (
          <MealCard key={`${meal.meal_type}-${String(idx)}`} meal={meal} />
        ))
      )}
    </View>
  );
}

function MacroBox({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.macroBox}>
      <Text style={styles.macroValue}>{value}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

function MealCard({ meal }: { meal: DailyMeal }): React.JSX.Element {
  const kcal = meal.adjusted_nutrition?.calories;
  return (
    <View style={styles.mealCard}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealSlot}>{capitalize(meal.meal_type)}</Text>
        {typeof kcal === 'number' ? (
          <Text style={styles.mealKcal}>{String(Math.round(kcal))} kcal</Text>
        ) : null}
      </View>
      {meal.narrative != null && meal.narrative !== '' ? (
        <Text style={styles.mealName}>{meal.narrative}</Text>
      ) : (
        <Text style={styles.mealName}>Recipe #{meal.recipe_id.slice(0, 8)}</Text>
      )}
    </View>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: resolveToken('light', '--cb-color-bg'),
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: resolveToken('light', '--cb-color-text'),
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-4']),
  },
  body: {
    paddingBottom: px(tokens.light['--cb-space-5']),
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: px(tokens.light['--cb-space-5']),
    gap: px(tokens.light['--cb-space-3']),
  },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text'),
  },
  emptyBody: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
    textAlign: 'center',
    lineHeight: px(tokens.light['--cb-body-md']) + 6,
  },
  errorText: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-error'),
  },
  primaryButton: {
    marginHorizontal: px(tokens.light['--cb-space-4']),
    marginBottom: px(tokens.light['--cb-space-3']),
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    paddingHorizontal: px(tokens.light['--cb-button-pad-x']),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
  },
  primaryButtonText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  creditsCard: {
    margin: px(tokens.light['--cb-space-4']),
    padding: px(tokens.light['--cb-space-4']),
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    borderRadius: 16,
    gap: 6,
  },
  creditsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creditsTier: {
    fontSize: px(tokens.light['--cb-caption']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-brand'),
    letterSpacing: 1,
  },
  creditsValue: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text'),
  },
  creditsReset: {
    fontSize: px(tokens.light['--cb-caption']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  dateStrip: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    gap: px(tokens.light['--cb-space-2']),
    paddingBottom: px(tokens.light['--cb-space-3']),
  },
  datePill: {
    minWidth: 64,
    paddingVertical: px(tokens.light['--cb-space-2']),
    paddingHorizontal: px(tokens.light['--cb-space-3']),
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    gap: 2,
  },
  datePillSelected: {
    borderColor: resolveToken('light', '--cb-color-brand'),
    backgroundColor: resolveToken('light', '--cb-color-brand-subtle'),
  },
  datePillUnselected: {
    borderColor: 'transparent',
    backgroundColor: resolveToken('light', '--cb-color-surface'),
  },
  datePillText: {
    fontSize: px(tokens.light['--cb-body-sm']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text'),
  },
  datePillTextSelected: {
    fontSize: px(tokens.light['--cb-body-sm']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-brand'),
  },
  datePillCeleb: {
    fontSize: px(tokens.light['--cb-caption']),
    color: resolveToken('light', '--cb-color-text-muted'),
    maxWidth: 72,
  },
  detail: {
    paddingTop: px(tokens.light['--cb-space-2']),
  },
  planHeaderCard: {
    marginHorizontal: px(tokens.light['--cb-space-4']),
    marginBottom: px(tokens.light['--cb-space-3']),
    padding: px(tokens.light['--cb-space-4']),
    backgroundColor: resolveToken('light', '--cb-color-brand-subtle'),
    borderRadius: 16,
    gap: 4,
  },
  planName: {
    fontSize: 20,
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-brand'),
  },
  planDates: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  macrosRow: {
    flexDirection: 'row',
    gap: px(tokens.light['--cb-space-3']),
    marginTop: px(tokens.light['--cb-space-3']),
  },
  macroBox: {
    flex: 1,
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    borderRadius: 8,
    paddingVertical: px(tokens.light['--cb-space-2']),
    alignItems: 'center',
  },
  macroValue: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text'),
  },
  macroLabel: {
    fontSize: px(tokens.light['--cb-caption']),
    color: resolveToken('light', '--cb-color-text-muted'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: px(tokens.light['--cb-caption']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text-muted'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingBottom: px(tokens.light['--cb-space-2']),
  },
  mealCard: {
    marginHorizontal: px(tokens.light['--cb-space-4']),
    marginBottom: px(tokens.light['--cb-space-2']),
    padding: px(tokens.light['--cb-space-3']),
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    borderRadius: 12,
    gap: 4,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealSlot: {
    fontSize: px(tokens.light['--cb-body-sm']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-brand'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealKcal: {
    fontSize: px(tokens.light['--cb-caption']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  mealName: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text'),
  },
  bodyText: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
    paddingHorizontal: px(tokens.light['--cb-space-4']),
  },
});
