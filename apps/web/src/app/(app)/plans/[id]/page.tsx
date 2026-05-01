'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { schemas } from '@celebbase/shared-types';
import { fetcher } from '../../../../lib/fetcher.js';
import { CitationChipList } from './CitationChipList.js';
import { CitationDrawer } from './CitationDrawer.js';
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
  const router = useRouter();
  const [loadStatus, setLoadStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [recipeTitles, setRecipeTitles] = useState<Record<string, string>>({});
  const [activeCitation, setActiveCitation] = useState<schemas.MealCitation | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isSavingRename, setIsSavingRename] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (isRenaming && renameInputRef.current !== null) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const startRename = useCallback((): void => {
    if (plan === null) return;
    setRenameDraft(plan.name ?? '');
    setRenameError(null);
    setIsRenaming(true);
  }, [plan]);

  const cancelRename = useCallback((): void => {
    setIsRenaming(false);
    setRenameError(null);
  }, []);

  const submitRename = useCallback(async (): Promise<void> => {
    if (plan === null) return;
    const trimmed = renameDraft.trim();
    if (trimmed === '') {
      setRenameError('제목은 비워둘 수 없습니다.');
      return;
    }
    if (trimmed === (plan.name ?? '')) {
      setIsRenaming(false);
      return;
    }
    setIsSavingRename(true);
    setRenameError(null);
    try {
      const updated = await fetcher(`/api/meal-plans/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
        headers: { 'Content-Type': 'application/json' },
        schema: schemas.MealPlanDetailResponseSchema,
      });
      setPlan(updated);
      setIsRenaming(false);
    } catch {
      setRenameError('이름 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSavingRename(false);
    }
  }, [id, plan, renameDraft]);

  const handleDelete = useCallback(async (): Promise<void> => {
    if (plan === null) return;
    const confirmed = window.confirm(
      '이 식단을 삭제하시겠어요? 삭제된 식단은 복구할 수 없습니다.',
    );
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/meal-plans/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error(`Delete failed: ${String(res.status)}`);
      }
      router.push('/plans');
    } catch {
      setIsDeleting(false);
      window.alert('삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }, [id, plan, router]);

  const recipeIds = useMemo(() => {
    if (plan === null) return [];
    const ids = new Set<string>();
    for (const day of plan.daily_plans) {
      for (const meal of day.meals) {
        ids.add(meal.recipe_id);
      }
    }
    return Array.from(ids);
  }, [plan]);

  useEffect(() => {
    if (recipeIds.length === 0) return;
    const query = new URLSearchParams({ ids: recipeIds.join(',') });
    fetcher(`/api/recipes?${query.toString()}`, {
      schema: schemas.RecipeBatchResponseSchema,
    })
      .then((data) => {
        const map: Record<string, string> = {};
        for (const recipe of data.recipes) {
          map[recipe.id] = recipe.title;
        }
        setRecipeTitles(map);
      })
      .catch(() => {
        setRecipeTitles({});
      });
  }, [recipeIds]);

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
        {isRenaming ? (
          <form
            className={styles.renameForm}
            onSubmit={(event) => {
              event.preventDefault();
              void submitRename();
            }}
          >
            <input
              ref={renameInputRef}
              type="text"
              className={styles.renameInput}
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  cancelRename();
                }
              }}
              maxLength={120}
              aria-label="식단 이름"
              disabled={isSavingRename}
            />
            <button
              type="submit"
              className={styles.renameSaveBtn}
              disabled={isSavingRename}
            >
              {isSavingRename ? '저장 중…' : '저장'}
            </button>
            <button
              type="button"
              className={styles.renameCancelBtn}
              onClick={cancelRename}
              disabled={isSavingRename}
            >
              취소
            </button>
          </form>
        ) : (
          <button
            type="button"
            className={styles.planNameBtn}
            onClick={startRename}
            aria-label={`이름 변경: ${plan.name ?? 'Untitled plan'}`}
          >
            <h1 className={styles.planName}>{plan.name ?? 'Untitled plan'}</h1>
          </button>
        )}
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
      {renameError !== null && (
        <p role="alert" className={styles.renameError}>
          {renameError}
        </p>
      )}

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
                {day.meals.map((meal, idx) => {
                  const mealTypeLabel = MEAL_TYPE_LABEL[meal.meal_type] ?? meal.meal_type;
                  const recipeTitle = recipeTitles[meal.recipe_id];
                  const fullLabel =
                    recipeTitle != null && recipeTitle !== ''
                      ? `${mealTypeLabel} · ${recipeTitle}`
                      : mealTypeLabel;
                  return (
                    <li key={idx} className={styles.mealRow}>
                      <div className={styles.mealRowMain}>
                        <span className={styles.mealType} title={fullLabel}>
                          {fullLabel}
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
                        <CitationChipList
                          citations={meal.citations ?? []}
                          maxVisible={3}
                          onSelect={setActiveCitation}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <CitationDrawer
        citation={activeCitation}
        onClose={() => setActiveCitation(null)}
      />

      <div className={styles.dangerZone}>
        <button
          type="button"
          className={styles.deleteBtn}
          onClick={() => void handleDelete()}
          disabled={isDeleting}
        >
          {isDeleting ? '삭제 중…' : '식단 삭제'}
        </button>
      </div>

      <DisclaimerBanner />
    </div>
  );
}
