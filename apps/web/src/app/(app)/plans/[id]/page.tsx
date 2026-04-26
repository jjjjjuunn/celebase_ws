'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { schemas } from '@celebbase/shared-types';
import { fetcher } from '../../../../lib/fetcher.js';
import { CitationChipList } from './CitationChipList.js';
import { ConfirmPlan } from './ConfirmPlan.js';
import { DisclaimerBanner } from '../../_components/DisclaimerBanner.js';
import styles from './plan-detail.module.css';

type Plan = schemas.MealPlanDetailResponse;

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  generating: 'Generating…',
  draft: 'Draft',
  completed: 'Ready to confirm',
  active: 'Active',
  failed: 'Failed',
  expired: 'Expired',
  archived: 'Archived',
};

const MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export default function PlanDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [loadStatus, setLoadStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [plan, setPlan] = useState<Plan | null>(null);

  const loadPlan = useCallback((): void => {
    setLoadStatus('loading');
    fetcher(`/api/meal-plans/${encodeURIComponent(id)}`, {
      schema: schemas.MealPlanDetailResponseSchema,
    })
      .then((data) => {
        setPlan(data);
        setLoadStatus('success');
      })
      .catch(() => {
        setLoadStatus('error');
      });
  }, [id]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  if (loadStatus === 'loading') {
    return (
      <div className={styles.page}>
        <Link href="/plans" className={styles.backLink}>← My plans</Link>
        <p className={styles.hint}>Loading…</p>
      </div>
    );
  }

  if (loadStatus === 'error' || plan === null) {
    return (
      <div className={styles.page}>
        <Link href="/plans" className={styles.backLink}>← My plans</Link>
        <p role="alert" className={styles.errorText}>Plan not found or failed to load.</p>
      </div>
    );
  }

  const isConfirmable = plan.status === 'completed';

  return (
    <div className={styles.page}>
      <Link href="/plans" className={styles.backLink}>← My plans</Link>

      <div className={styles.planHeader}>
        <h1 className={styles.planName}>{plan.name ?? 'Untitled plan'}</h1>
        <span className={[styles.statusBadge, plan.status === 'active' ? styles.confirmed : ''].filter(Boolean).join(' ')}>
          {STATUS_LABEL[plan.status] ?? plan.status}
        </span>
        {plan.mode === 'llm' ? (
          <span className={styles.modeBadgeLlm} aria-label="LLM AI로 개인화된 식단입니다.">
            LLM 개인화
          </span>
        ) : (
          <span className={styles.modeBadgeStandard} aria-label="추천 기본 식단입니다.">
            기본 식단
          </span>
        )}
      </div>

      <p className={styles.dateRange}>
        {plan.start_date} – {plan.end_date}
      </p>

      {plan.mode !== 'llm' && (
        <div className={styles.standardBanner} role="status" aria-live="polite">
          자세한 맞춤 분석이 진행되는 동안, 먼저 추천 기본 식단을 확인해 보세요.
        </div>
      )}

      {isConfirmable && (
        <ConfirmPlan planId={plan.id} onConfirmed={loadPlan} />
      )}

      <section aria-labelledby="days-heading">
        <h2 id="days-heading" className={styles.sectionHeading}>
          Daily Plan
        </h2>
        <ol className={styles.dayList}>
          {plan.daily_plans.map((day) => (
            <li key={day.day} className={styles.dayCard}>
              <div className={styles.dayHeader}>
                <span className={styles.dayLabel}>Day {String(day.day)}</span>
                <span className={styles.dayDate}>{day.date}</span>
                {day.daily_totals !== undefined && (
                  <span className={styles.dayKcal}>{String(day.daily_totals.calories)} kcal</span>
                )}
              </div>
              <ul className={styles.mealList}>
                {day.meals.map((meal, idx) => (
                  <li key={idx} className={styles.mealRow}>
                    <div className={styles.mealRowMain}>
                      <span className={styles.mealType}>
                        {MEAL_TYPE_LABEL[meal.meal_type] ?? meal.meal_type}
                      </span>
                      {meal.adjusted_nutrition !== undefined ? (
                        <span className={styles.mealKcal}>
                          {String(meal.adjusted_nutrition.calories)} kcal
                        </span>
                      ) : null}
                      <Link
                        href={`/recipes/${meal.recipe_id}`}
                        className={styles.recipeLink}
                      >
                        View recipe →
                      </Link>
                    </div>
                    {meal.narrative != null && (
                      <p className={styles.narrativeCard}>{meal.narrative}</p>
                    )}
                    {(meal.citations ?? []).length > 0 && (
                      <CitationChipList citations={meal.citations ?? []} maxVisible={3} />
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <DisclaimerBanner />
    </div>
  );
}
