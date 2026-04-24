'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { schemas } from '@celebbase/shared-types';
import type { z } from 'zod';
import { fetcher } from '../../../lib/fetcher.js';
import { useUser } from '../../../lib/user-context.js';
import { AlignmentRing } from '../../../features/home/AlignmentRing.js';
import { MealRationaleDrawer } from '../../../features/home/MealRationaleDrawer.js';
import { MealActionHandle, type MealStatus } from '../../../features/home/MealActionHandle.js';
import { Day5RecapCard } from '../../../features/home/Day5RecapCard.js';
import styles from './home.module.css';

const DAY5_DISMISS_KEY = 'celebbase.day5RecapDismissed';

const UNDO_WINDOW_MS = 4000;

interface PendingSkip {
  mealKey: string;
  recipeId: string;
  mealTypeLabel: string;
  timerId: ReturnType<typeof setTimeout>;
}

function buildMealKey(dateIso: string, mealType: string, recipeId: string): string {
  return `${dateIso}:${mealType}:${recipeId}`;
}

type MealPlanWire = z.infer<typeof schemas.MealPlanWireSchema>;
type MealPlanListResponse = z.infer<typeof schemas.MealPlanListResponseSchema>;
type DailyLogSummary = z.infer<typeof schemas.DailyLogSummaryResponseSchema>;
type BioProfileWire = z.infer<typeof schemas.BioProfileWireSchema>;
type TrialRecap = z.infer<typeof schemas.TrialRecapResponseSchema>;

const MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  smoothie: 'Smoothie',
};

const WEEKDAY_LABEL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIsoDate(d);
}

function slugToDisplayName(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join(' ');
}

function firstNameOf(fullName: string | undefined): string | null {
  if (fullName === undefined || fullName.length === 0) return null;
  const first = fullName.split(' ')[0];
  return first !== undefined && first.length > 0 ? first : null;
}

function getTodayKey(): string {
  return toIsoDate(new Date());
}

function pickActivePlan(plans: MealPlanWire[]): MealPlanWire | null {
  const actives = plans.filter((p) => p.status === 'active');
  if (actives.length === 0) return null;
  actives.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  return actives[0] ?? null;
}

function computeAlignmentPct(summary: DailyLogSummary | null): number | null {
  if (summary === null || summary.total_logs === 0) return null;
  const adherence = summary.completion_rate ?? 0;
  const energyNorm = summary.avg_energy_level !== null ? summary.avg_energy_level / 5 : 0.5;
  const moodNorm = summary.avg_mood !== null ? summary.avg_mood / 5 : 0.5;
  const blend = adherence * 0.7 + energyNorm * 0.15 + moodNorm * 0.15;
  return Math.round(Math.max(0, Math.min(1, blend)) * 100);
}

interface WeekStripCell {
  date: string;
  weekdayLabel: string;
  isToday: boolean;
  isFuture: boolean;
  inPlan: boolean;
  mealsCount: number;
}

function buildWeekStrip(plan: MealPlanWire | null): WeekStripCell[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay(); // 0=Sun
  const cells: WeekStripCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - dayOfWeek + i);
    const iso = toIsoDate(d);
    const weekdayLabel = WEEKDAY_LABEL[d.getDay()] ?? '·';
    const planDay = plan?.daily_plans.find((dp) => dp.date === iso);
    cells.push({
      date: iso,
      weekdayLabel,
      isToday: iso === toIsoDate(today),
      isFuture: d > today,
      inPlan: planDay !== undefined,
      mealsCount: planDay?.meals.length ?? 0,
    });
  }
  return cells;
}

interface TodayMeal {
  date: string;
  meal_type: string;
  recipe_id: string;
  calories: number | null;
}

function resolveTodayMeals(plan: MealPlanWire | null): TodayMeal[] {
  if (plan === null) return [];
  const today = getTodayKey();
  const day = plan.daily_plans.find((d) => d.date === today);
  if (day === undefined) return [];
  return day.meals.map((m) => ({
    date: day.date,
    meal_type: m.meal_type,
    recipe_id: m.recipe_id,
    calories: m.adjusted_nutrition?.calories ?? null,
  }));
}

function isDayZero(plan: MealPlanWire | null, summary: DailyLogSummary | null): boolean {
  return plan !== null && (summary === null || summary.total_logs === 0);
}

export function HomeClient(): React.ReactElement {
  const tHome = useTranslations('home');
  const { user } = useUser();

  const [plan, setPlan] = useState<MealPlanWire | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [summary, setSummary] = useState<DailyLogSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [bioProfile, setBioProfile] = useState<BioProfileWire | null>(null);
  const [drawerRecipeId, setDrawerRecipeId] = useState<string | null>(null);
  const [mealStatuses, setMealStatuses] = useState<Record<string, MealStatus>>({});
  const [pendingSkip, setPendingSkip] = useState<PendingSkip | null>(null);
  const pendingSkipRef = useRef<PendingSkip | null>(null);
  const [trialRecap, setTrialRecap] = useState<TrialRecap | null>(null);
  const [day5Dismissed, setDay5Dismissed] = useState(false);

  useEffect(() => {
    pendingSkipRef.current = pendingSkip;
  }, [pendingSkip]);

  useEffect(() => {
    return () => {
      const current = pendingSkipRef.current;
      if (current !== null) clearTimeout(current.timerId);
    };
  }, []);

  const firePantryCarryover = useCallback(async (recipeId: string): Promise<void> => {
    try {
      await fetcher('/api/pantry/carryover', {
        method: 'POST',
        body: JSON.stringify({
          recipe_id: recipeId,
          source: 'skip',
          skipped_at: new Date().toISOString(),
        }),
      });
    } catch {
      // Fire-and-forget. If the merge-patch fails, next-plan pantry simply misses this entry.
    }
  }, []);

  const handleComplete = useCallback((dateIso: string, mealType: string, recipeId: string) => {
    const key = buildMealKey(dateIso, mealType, recipeId);
    setMealStatuses((prev) => ({ ...prev, [key]: 'completed' }));
  }, []);

  const handleSkip = useCallback(
    (dateIso: string, mealType: string, recipeId: string, mealTypeLabel: string) => {
      const key = buildMealKey(dateIso, mealType, recipeId);
      const previous = pendingSkipRef.current;
      if (previous !== null) {
        clearTimeout(previous.timerId);
      }
      setMealStatuses((prev) => ({ ...prev, [key]: 'skipped' }));
      const timerId = setTimeout(() => {
        void firePantryCarryover(recipeId);
        setPendingSkip(null);
      }, UNDO_WINDOW_MS);
      setPendingSkip({ mealKey: key, recipeId, mealTypeLabel, timerId });
    },
    [firePantryCarryover],
  );

  const handleUndoSkip = useCallback(() => {
    const current = pendingSkipRef.current;
    if (current === null) return;
    clearTimeout(current.timerId);
    setMealStatuses((prev) => {
      const next = { ...prev };
      delete next[current.mealKey];
      return next;
    });
    setPendingSkip(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetcher('/api/meal-plans', { schema: schemas.MealPlanListResponseSchema })
      .then((data: MealPlanListResponse) => {
        if (!cancelled) {
          setPlan(pickActivePlan(data.items));
          setPlanLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetcher('/api/users/me/bio-profile', {
      schema: schemas.BioProfileResponseSchema,
    })
      .then((data) => {
        if (!cancelled) setBioProfile(data.bio_profile);
      })
      .catch(() => {
        // 404 — bio profile not yet created; drawer handles the null case gracefully.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = nDaysAgo(6);
    const end = getTodayKey();
    fetcher(`/api/daily-logs/summary?start_date=${start}&end_date=${end}`, {
      schema: schemas.DailyLogSummaryResponseSchema,
    })
      .then((data) => {
        if (!cancelled) {
          setSummary(data);
          setSummaryLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDay5Dismissed(window.localStorage.getItem(DAY5_DISMISS_KEY) === 'true');
    }
    let cancelled = false;
    fetcher('/api/trial/recap', { schema: schemas.TrialRecapResponseSchema })
      .then((data: TrialRecap) => {
        if (!cancelled) setTrialRecap(data);
      })
      .catch(() => {
        // recap is best-effort; silent failure keeps the home experience intact.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismissDay5 = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DAY5_DISMISS_KEY, 'true');
    }
    setDay5Dismissed(true);
  }, []);

  const firstName = firstNameOf(user?.display_name);
  const celebrityName = useMemo(() => {
    const slug = user?.preferred_celebrity_slug ?? null;
    return slug !== null ? slugToDisplayName(slug) : null;
  }, [user?.preferred_celebrity_slug]);

  const weekCells = useMemo(() => buildWeekStrip(plan), [plan]);
  const todayMeals = useMemo(() => resolveTodayMeals(plan), [plan]);
  const alignment = useMemo(() => computeAlignmentPct(summary), [summary]);

  const drawerNarrative = useMemo((): string | null => {
    if (drawerRecipeId === null || plan === null) return null;
    const today = getTodayKey();
    const day = plan.daily_plans.find((d) => d.date === today);
    if (day === undefined) return null;
    const slot = day.meals.find((m) => m.recipe_id === drawerRecipeId);
    return slot?.narrative ?? null;
  }, [drawerRecipeId, plan]);

  if (planLoading) {
    return (
      <div className={styles.page}>
        <p className={styles.hint}>{tHome('weekStrip.today')}…</p>
      </div>
    );
  }

  // Empty state — no active plan
  if (plan === null) {
    return (
      <div className={styles.page}>
        <section className={styles.emptyHero} aria-labelledby="home-empty-title">
          <h1 id="home-empty-title" className={styles.emptyTitle}>
            {tHome('noPlan.title')}
          </h1>
          <p className={styles.emptyBody}>{tHome('noPlan.body')}</p>
          <Link href="/celebrities" className={styles.primaryCta}>
            {tHome('noPlan.cta')} →
          </Link>
        </section>
      </div>
    );
  }

  const heroMeal = todayMeals[0] ?? null;
  const restOfToday = todayMeals.slice(1);
  const dayZero = isDayZero(plan, summary);

  const greetingText =
    firstName !== null && celebrityName !== null
      ? tHome('greetingReady', { name: firstName, celebrity: celebrityName })
      : firstName !== null
        ? `${firstName}, your Blueprint is ready`
        : tHome('greetingFallback');

  const showDay5Recap =
    trialRecap !== null && trialRecap.trial_day === 5 && !day5Dismissed;

  return (
    <div className={styles.page}>
      {showDay5Recap && trialRecap !== null && (
        <Day5RecapCard
          recap={trialRecap}
          celebrityDisplayName={celebrityName}
          onDismiss={handleDismissDay5}
        />
      )}
      <header className={styles.greetingRow}>
        <h1 className={styles.greetingText}>{greetingText}</h1>
        {celebrityName !== null && (
          <span className={styles.personaSubline}>with {celebrityName}</span>
        )}
      </header>

      <section className={styles.weekStrip} aria-label="This week">
        <ol className={styles.weekList}>
          {weekCells.map((cell) => (
            <li
              key={cell.date}
              className={[
                styles.weekCell,
                cell.isToday ? styles.weekCellToday : '',
                cell.isFuture ? styles.weekCellFuture : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={cell.isToday ? 'date' : undefined}
            >
              <span className={styles.weekCellLabel}>{cell.weekdayLabel}</span>
              <span className={styles.weekCellDot} aria-hidden="true">
                {cell.inPlan && cell.mealsCount > 0 ? '•' : '·'}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {heroMeal !== null ? (
        <section className={styles.todayHero} aria-labelledby="today-hero-title">
          <div className={styles.todayHeroBadge}>
            <span>{tHome('todayHero.upNext')}</span>
            <span className={styles.nihBadge} title="Triple-Layer Safety: NIH + Mifflin-St Jeor + USDA">
              {tHome('todayHero.nihBadge')}
            </span>
          </div>
          <h2 id="today-hero-title" className={styles.todayHeroTitle}>
            {MEAL_TYPE_LABEL[heroMeal.meal_type] ?? heroMeal.meal_type}
          </h2>
          {heroMeal.calories !== null && (
            <p className={styles.todayHeroMeta}>{Math.round(heroMeal.calories)} kcal</p>
          )}
          {dayZero && (
            <p className={styles.dayZeroHint}>
              {tHome('dayZero.title')} — {tHome('dayZero.body')}
            </p>
          )}
          <button
            type="button"
            className={styles.todayHeroCta}
            onClick={() => {
              setDrawerRecipeId(heroMeal.recipe_id);
            }}
            aria-haspopup="dialog"
          >
            {tHome('todayHero.viewDetails')} →
          </button>
          <MealActionHandle
            status={mealStatuses[buildMealKey(heroMeal.date, heroMeal.meal_type, heroMeal.recipe_id)] ?? 'scheduled'}
            mealTypeLabel={MEAL_TYPE_LABEL[heroMeal.meal_type] ?? heroMeal.meal_type}
            dateIso={heroMeal.date}
            onComplete={() => {
              handleComplete(heroMeal.date, heroMeal.meal_type, heroMeal.recipe_id);
            }}
            onSkip={() => {
              handleSkip(
                heroMeal.date,
                heroMeal.meal_type,
                heroMeal.recipe_id,
                MEAL_TYPE_LABEL[heroMeal.meal_type] ?? heroMeal.meal_type,
              );
            }}
          />
        </section>
      ) : (
        <section className={styles.todayHero}>
          <p className={styles.hint}>No meals scheduled for today.</p>
        </section>
      )}

      {restOfToday.length > 0 && (
        <section className={styles.restGrid} aria-label="Rest of today">
          <h3 className={styles.sectionLabel}>{tHome('remaining')}</h3>
          <ul className={styles.restList}>
            {restOfToday.map((m, idx) => {
              const label = MEAL_TYPE_LABEL[m.meal_type] ?? m.meal_type;
              const key = buildMealKey(m.date, m.meal_type, m.recipe_id);
              return (
                <li key={`${m.date}-${m.meal_type}-${String(idx)}`} className={styles.restCard}>
                  <span className={styles.restType}>{label}</span>
                  {m.calories !== null && (
                    <span className={styles.restKcal}>{Math.round(m.calories)} kcal</span>
                  )}
                  <button
                    type="button"
                    className={styles.restLink}
                    onClick={() => {
                      setDrawerRecipeId(m.recipe_id);
                    }}
                    aria-haspopup="dialog"
                  >
                    View →
                  </button>
                  <MealActionHandle
                    status={mealStatuses[key] ?? 'scheduled'}
                    mealTypeLabel={label}
                    dateIso={m.date}
                    onComplete={() => {
                      handleComplete(m.date, m.meal_type, m.recipe_id);
                    }}
                    onSkip={() => {
                      handleSkip(m.date, m.meal_type, m.recipe_id, label);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className={styles.alignmentFooter} aria-labelledby="alignment-title">
        <AlignmentRing
          value={alignment}
          loading={summaryLoading}
          personaDisplayName={celebrityName}
        />
        <div className={styles.alignmentCopy}>
          <span id="alignment-title" className={styles.alignmentTitle}>
            {tHome('alignment.title')}
          </span>
          <span className={styles.alignmentSub}>
            {alignment === null
              ? '—'
              : alignment < 50
                ? tHome('alignment.low')
                : alignment < 80
                  ? tHome('alignment.mid')
                  : tHome('alignment.high')}
          </span>
        </div>
      </section>

      <MealRationaleDrawer
        recipeId={drawerRecipeId}
        bioProfile={bioProfile}
        narrative={drawerNarrative}
        celebrityName={celebrityName}
        onClose={() => {
          setDrawerRecipeId(null);
        }}
      />

      {pendingSkip !== null && (
        <div className={styles.undoToast} role="status" aria-live="polite">
          <span className={styles.undoToastLabel}>
            Skipped {pendingSkip.mealTypeLabel}
          </span>
          <button
            type="button"
            className={styles.undoButton}
            onClick={handleUndoSkip}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
