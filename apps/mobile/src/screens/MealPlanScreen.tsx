// MealPlan — Plan tab 의 root. 사용자의 가장 최근 plan 의 오늘 끼니 + 영양 요약.
//
// 4 상태:
//   - loading — 첫 fetch
//   - empty   — plan 없음 (온보딩 필요 또는 generate 권유)
//   - error   — 네트워크 / 4xx-5xx
//   - loaded  — 최신 active plan 의 day[0] 표시

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@celebbase/design-tokens';
import type { schemas } from '@celebbase/shared-types';

import { px, resolveToken } from '../lib/tokens';
import { listMyMealPlans } from '../services/meal-plans';

type Phase =
  | { state: 'loading' }
  | { state: 'empty' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; plan: schemas.MealPlanWire };

export function MealPlanScreen(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setPhase({ state: 'loading' });

    listMyMealPlans()
      .then((res) => {
        if (cancelled) return;
        // 가장 최근 active plan 선택. 없으면 list 첫 항목, 그것도 없으면 empty.
        if (res.items.length === 0) {
          setPhase({ state: 'empty' });
          return;
        }
        const activePlan = res.items.find((p) => p.status === 'active') ?? res.items[0];
        setPhase({ state: 'loaded', plan: activePlan });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'unknown';
        setPhase({ state: 'error', message });
      });

    return (): void => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.screenTitle}>Your Plan</Text>

      {phase.state === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator
            size="large"
            color={resolveToken('light', '--cb-color-brand')}
          />
        </View>
      ) : phase.state === 'empty' ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🥗</Text>
          <Text style={styles.emptyTitle}>No plan yet</Text>
          <Text style={styles.emptyBody}>
            Complete your profile to receive a personalized plan inspired by your favorite celebrities.
          </Text>
        </View>
      ) : phase.state === 'error' ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Couldn't load your plan.</Text>
        </View>
      ) : (
        <LoadedPlan plan={phase.plan} />
      )}
    </SafeAreaView>
  );
}

interface LoadedPlanProps {
  plan: schemas.MealPlanWire;
}

function LoadedPlan({ plan }: LoadedPlanProps): React.JSX.Element {
  // daily_plans 가 비어있는 plan 도 wire 상 valid (BE 생성 중 / 실패). guard.
  if (plan.daily_plans.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.bodyText}>This plan has no daily meals yet.</Text>
      </View>
    );
  }
  const today = plan.daily_plans[0]; // 가장 첫 날 표시. 추후 today 매칭 / day 선택 chore.

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.planHeaderCard}>
        <Text style={styles.planName}>{plan.name ?? 'My Plan'}</Text>
        <Text style={styles.planDates}>
          {plan.start_date} — {plan.end_date}
        </Text>
        <View style={styles.macrosRow}>
          <MacroBox label="kcal" value={String(Math.round(today.daily_totals.calories))} />
          <MacroBox label="P" value={`${String(Math.round(today.daily_totals.protein_g))}g`} />
          <MacroBox label="C" value={`${String(Math.round(today.daily_totals.carbs_g))}g`} />
          <MacroBox label="F" value={`${String(Math.round(today.daily_totals.fat_g))}g`} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Today's meals</Text>

      {today.meals.length === 0 ? (
        <Text style={styles.bodyText}>No meals scheduled.</Text>
      ) : (
        today.meals.map((meal, idx) => (
          <MealCard key={`${meal.meal_type}-${String(idx)}`} meal={meal} />
        ))
      )}
    </ScrollView>
  );
}

interface MacroBoxProps {
  label: string;
  value: string;
}

function MacroBox({ label, value }: MacroBoxProps): React.JSX.Element {
  return (
    <View style={styles.macroBox}>
      <Text style={styles.macroValue}>{value}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

interface MealCardProps {
  meal: schemas.MealPlanWire['daily_plans'][number]['meals'][number];
}

function MealCard({ meal }: MealCardProps): React.JSX.Element {
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
  planHeaderCard: {
    margin: px(tokens.light['--cb-space-4']),
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
