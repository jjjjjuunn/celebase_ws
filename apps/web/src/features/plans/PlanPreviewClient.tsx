'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { schemas } from '@celebbase/shared-types';
import { fetcher, postJson, patchJson, FetcherError } from '../../lib/fetcher.js';
import {
  InstacartConfirmModal,
  type InstacartCartSummary,
  type InstacartItem,
} from './InstacartConfirmModal.js';
import styles from './preview.module.css';

type Plan = schemas.MealPlanDetailResponse;
type Recipe = schemas.RecipeWire;
type Aggregate = schemas.PlanPreviewAggregateResponse;

interface Props {
  planId: string;
}

const MEAL_TYPE_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

type ViewMode = 'week' | 'summary';

function slotKey(date: string, mealType: string): string {
  return `${date}:${mealType}`;
}

function weekIndexFor(dayNumber: number): number {
  return Math.floor((dayNumber - 1) / 7);
}

export function PlanPreviewClient({ planId }: Props): React.ReactElement {
  const router = useRouter();
  const [loadStatus, setLoadStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
  const [skippedSlots, setSkippedSlots] = useState<Set<string>>(new Set());
  const [aggregate, setAggregate] = useState<Aggregate | null>(null);
  const [aggregateStatus, setAggregateStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [activeWeek, setActiveWeek] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [cartSummary, setCartSummary] = useState<InstacartCartSummary | null>(null);
  const [confirming, setConfirming] = useState<boolean>(false);

  const abortRef = useRef<AbortController | null>(null);

  const loadPlan = useCallback(async (): Promise<void> => {
    setLoadStatus('loading');
    try {
      const planData = await fetcher<Plan>(`/api/meal-plans/${encodeURIComponent(planId)}`, {
        schema: schemas.MealPlanDetailResponseSchema,
      });

      const previewable = planData.status === 'draft' || planData.status === 'completed';
      if (!previewable || planData.confirmed_at != null) {
        router.replace(`/plans/${encodeURIComponent(planData.id)}`);
        return;
      }

      setPlan(planData);

      const recipeIds = new Set<string>();
      for (const day of planData.daily_plans) {
        for (const meal of day.meals) {
          recipeIds.add(meal.recipe_id);
        }
      }
      if (recipeIds.size > 0) {
        const idsCsv = Array.from(recipeIds).join(',');
        const batch = await fetcher<schemas.RecipeBatchResponse>(
          `/api/recipes?ids=${encodeURIComponent(idsCsv)}`,
          { schema: schemas.RecipeBatchResponseSchema },
        );
        const map: Record<string, Recipe> = {};
        for (const r of batch.recipes) map[r.id] = r;
        setRecipes(map);
      }
      setLoadStatus('success');
    } catch {
      setLoadStatus('error');
    }
  }, [planId, router]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const refreshAggregate = useCallback(
    async (slots: Set<string>): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setAggregateStatus('loading');
      try {
        const body = { skipped_slots: Array.from(slots) };
        const data = await postJson<Aggregate>(
          `/api/meal-plans/${encodeURIComponent(planId)}/preview/aggregate`,
          body,
          {
            schema: schemas.PlanPreviewAggregateResponseSchema,
            signal: controller.signal,
          },
        );
        setAggregate(data);
        setAggregateStatus('idle');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setAggregateStatus('error');
      }
    },
    [planId],
  );

  useEffect(() => {
    if (plan === null) return;
    void refreshAggregate(skippedSlots);
  }, [plan, skippedSlots, refreshAggregate]);

  const toggleSkip = useCallback((date: string, mealType: string): void => {
    setSkippedSlots((prev) => {
      const next = new Set(prev);
      const key = slotKey(date, mealType);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const weekCount = useMemo(() => {
    if (plan === null) return 1;
    return Math.max(1, Math.ceil(plan.daily_plans.length / 7));
  }, [plan]);

  const visibleDays = useMemo(() => {
    if (plan === null) return [];
    if (viewMode === 'summary') return plan.daily_plans;
    return plan.daily_plans.filter((d, i) => weekIndexFor(d.day ?? i + 1) === activeWeek);
  }, [plan, viewMode, activeWeek]);

  const totalMealCount = useMemo(() => {
    if (plan === null) return 0;
    let n = 0;
    for (const day of plan.daily_plans) n += day.meals.length;
    return n;
  }, [plan]);

  const activeMealCount = totalMealCount - skippedSlots.size;
  const ingredientCount = aggregate?.ingredients.length ?? 0;
  const estimatedTotal = aggregate?.estimated_total_usd ?? 0;
  const unitConflictCount = aggregate?.unit_conflicts.length ?? 0;

  const cartItems = useMemo<InstacartItem[]>(() => {
    return (aggregate?.ingredients ?? []).map((line) => ({
      name: line.name,
      quantity: line.qty,
      unit: line.unit,
    }));
  }, [aggregate]);

  const handleSync = useCallback(async (): Promise<void> => {
    if (plan === null) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const summary = await postJson<InstacartCartSummary>(
        '/api/instacart/cart',
        {
          meal_plan_id: plan.id,
          items: cartItems,
          skipped_slots: Array.from(skippedSlots),
        },
      );
      setCartSummary(summary);
    } catch (err) {
      const message =
        err instanceof FetcherError
          ? `${err.code}: ${err.message}`
          : 'Failed to sync. Please try again.';
      setSyncError(message);
    } finally {
      setSyncing(false);
    }
  }, [plan, cartItems, skippedSlots]);

  const handleConfirmAndExit = useCallback(async (): Promise<void> => {
    if (plan === null) return;
    setConfirming(true);
    setSyncError(null);
    try {
      // Plan 22 Phase E — Instacart preview accepted, flip the plan to active so
      // subsequent loads bypass the preview. confirmed_at is stamped server-side
      // by the PATCH handler (migration 0013).
      await patchJson(
        `/api/meal-plans/${encodeURIComponent(plan.id)}`,
        { status: 'active' },
        { schema: schemas.MealPlanDetailResponseSchema },
      );
      router.push('/home');
    } catch (err) {
      const message =
        err instanceof FetcherError
          ? `${err.code}: ${err.message}`
          : 'Failed to confirm plan. Please try again.';
      setSyncError(message);
      setConfirming(false);
    }
  }, [plan, router]);

  if (loadStatus === 'loading') {
    return (
      <div className={styles.page}>
        <Link href="/plans" className={styles.backLink}>← My plans</Link>
        <p className={styles.hint}>Loading your Blueprint…</p>
      </div>
    );
  }

  if (loadStatus === 'error' || plan === null) {
    return (
      <div className={styles.page}>
        <Link href="/plans" className={styles.backLink}>← My plans</Link>
        <p role="alert" className={styles.errorText}>
          We could not load this plan. Try again in a moment.
        </p>
      </div>
    );
  }

  const durationDays = plan.daily_plans.length;
  const showWeekTabs = durationDays > 7 && viewMode === 'week';

  return (
    <div className={styles.page}>
      <Link href="/plans" className={styles.backLink}>← My plans</Link>

      <header className={styles.previewHeader}>
        <h1 className={styles.previewTitle}>
          {plan.name ?? `Your ${String(durationDays)}-day Blueprint is ready`}
        </h1>
        <div className={styles.previewMeta}>
          <span className={styles.metaBadge}>{String(durationDays)}-day</span>
          <span className={styles.metaDivider} aria-hidden="true">·</span>
          <span className={styles.metaRange}>{plan.start_date} – {plan.end_date}</span>
        </div>
        <p className={styles.previewSubtitle}>
          Review every meal before we sync it to your Instacart cart. Skip any you already have plans for — subtotals update live.
        </p>
      </header>

      {durationDays > 7 && (
        <div className={styles.viewControls} role="group" aria-label="View mode">
          <button
            type="button"
            className={viewMode === 'week' ? styles.viewToggleActive : styles.viewToggle}
            aria-pressed={viewMode === 'week'}
            onClick={() => { setViewMode('week'); }}
          >
            Weekly
          </button>
          <button
            type="button"
            className={viewMode === 'summary' ? styles.viewToggleActive : styles.viewToggle}
            aria-pressed={viewMode === 'summary'}
            onClick={() => { setViewMode('summary'); }}
          >
            Summary
          </button>
        </div>
      )}

      {showWeekTabs && (
        <div
          className={styles.weekTabs}
          role="tablist"
          aria-label="Week selector"
        >
          {Array.from({ length: weekCount }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={activeWeek === i}
              tabIndex={activeWeek === i ? 0 : -1}
              className={activeWeek === i ? styles.weekTabActive : styles.weekTab}
              onClick={() => { setActiveWeek(i); }}
            >
              Week {String(i + 1)}
            </button>
          ))}
        </div>
      )}

      <section aria-labelledby="plan-grid-heading" className={styles.gridSection}>
        <h2 id="plan-grid-heading" className={styles.srOnly}>
          Plan grid
        </h2>
        <ol className={styles.dayList}>
          {visibleDays.map((day) => {
            const mealsByType = new Map<string, (typeof day.meals)[number]>();
            for (const m of day.meals) mealsByType.set(m.meal_type, m);
            return (
              <li key={day.day} className={styles.dayColumn}>
                <div className={styles.dayColumnHeader}>
                  <span className={styles.dayLabel}>Day {String(day.day)}</span>
                  <span className={styles.dayDate}>{day.date}</span>
                </div>
                <ul className={styles.mealRowList}>
                  {MEAL_TYPE_ORDER.map((mealType) => {
                    const meal = mealsByType.get(mealType);
                    if (!meal) {
                      return (
                        <li key={mealType} className={styles.mealSlotEmpty}>
                          <span className={styles.mealSlotType}>
                            {MEAL_TYPE_LABEL[mealType]}
                          </span>
                          <span className={styles.mealSlotEmptyHint}>—</span>
                        </li>
                      );
                    }
                    const recipe = recipes[meal.recipe_id];
                    const key = slotKey(day.date, meal.meal_type);
                    const isSkipped = skippedSlots.has(key);
                    const kcal = meal.adjusted_nutrition?.calories
                      ?? recipe?.nutrition.calories
                      ?? 0;
                    return (
                      <li
                        key={meal.meal_type + meal.recipe_id}
                        className={isSkipped ? styles.mealCardSkipped : styles.mealCard}
                      >
                        <div className={styles.mealCardHead}>
                          <span className={styles.mealSlotType}>
                            {MEAL_TYPE_LABEL[meal.meal_type] ?? meal.meal_type}
                          </span>
                          {isSkipped && (
                            <span className={styles.skippedPill} aria-hidden="true">
                              Skipped
                            </span>
                          )}
                        </div>
                        <div className={styles.mealCardBody}>
                          <span className={styles.mealTitle}>
                            {recipe?.title ?? 'Recipe loading…'}
                          </span>
                          <span className={styles.mealMacro}>
                            {String(Math.round(kcal))} kcal
                          </span>
                        </div>
                        <div className={styles.mealCardFoot}>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isSkipped}
                            aria-label={
                              isSkipped
                                ? `Include ${MEAL_TYPE_LABEL[meal.meal_type] ?? meal.meal_type} on ${day.date}`
                                : `Skip ${MEAL_TYPE_LABEL[meal.meal_type] ?? meal.meal_type} on ${day.date}`
                            }
                            className={isSkipped ? styles.includeBtn : styles.skipBtn}
                            onClick={() => { toggleSkip(day.date, meal.meal_type); }}
                          >
                            {isSkipped ? 'Include' : 'Skip'}
                          </button>
                          {recipe && (
                            <Link
                              href={`/recipes/${recipe.id}`}
                              className={styles.recipeLink}
                            >
                              Details →
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>

      <footer
        className={styles.ingredientSummary}
        role="status"
        aria-live="polite"
      >
        <div className={styles.summaryStats}>
          <div className={styles.summaryPrimary}>
            <span className={styles.summaryCount}>
              {String(ingredientCount)} items
            </span>
            <span className={styles.summaryMeta}>
              · {String(activeMealCount)} of {String(totalMealCount)} meals
            </span>
          </div>
          <div className={styles.summaryPrice}>
            {aggregateStatus === 'loading' ? (
              <span className={styles.summaryLoading}>Recalculating…</span>
            ) : (
              <span className={styles.summaryTotal}>
                ${estimatedTotal.toFixed(2)}
              </span>
            )}
          </div>
        </div>
        {unitConflictCount > 0 && (
          <p className={styles.conflictWarning}>
            {String(unitConflictCount)} ingredient{unitConflictCount === 1 ? '' : 's'} use mixed units — shown separately for safety.
          </p>
        )}
        {syncError !== null && (
          <p role="alert" className={styles.errorText}>{syncError}</p>
        )}
        <button
          type="button"
          className={styles.syncBtn}
          disabled={syncing || confirming || ingredientCount === 0}
          onClick={() => { void handleSync(); }}
        >
          {syncing ? 'Syncing…' : 'Sync to Instacart'}
        </button>
      </footer>

      <InstacartConfirmModal
        open={cartSummary !== null}
        summary={cartSummary}
        items={cartItems}
        skippedCount={skippedSlots.size}
        onClose={() => { setCartSummary(null); }}
        onContinue={() => { void handleConfirmAndExit(); }}
      />
    </div>
  );
}
