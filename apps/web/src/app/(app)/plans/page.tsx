'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { schemas } from '@celebbase/shared-types';
import { fetcher } from '../../../lib/fetcher.js';
import { SwipeablePlanCard } from './SwipeablePlanCard.js';
import styles from './plans-list.module.css';

type MealPlanItem = schemas.MealPlanListResponse['items'][number];

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  generating: 'Generating…',
  draft: 'Draft',
  completed: 'Ready',
  active: 'Active',
  failed: 'Failed',
  expired: 'Expired',
  archived: 'Archived',
};

export default function PlansPage(): React.ReactElement {
  const [loadStatus, setLoadStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [plans, setPlans] = useState<MealPlanItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetcher('/api/meal-plans', { schema: schemas.MealPlanListResponseSchema })
      .then((data) => {
        if (!cancelled) {
          setPlans(data.items);
          setLoadStatus('success');
        }
      })
      .catch(() => {
        if (!cancelled) setLoadStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = useCallback(
    async (planId: string): Promise<void> => {
      const confirmed = window.confirm(
        '이 식단을 삭제하시겠어요? 삭제된 식단은 복구할 수 없습니다.',
      );
      if (!confirmed) return;
      setDeletingId(planId);
      setDeleteError(null);
      try {
        const res = await fetch(`/api/meal-plans/${encodeURIComponent(planId)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          throw new Error(`Delete failed: ${String(res.status)}`);
        }
        setPlans((prev) => prev.filter((p) => p.id !== planId));
        setOpenId(null);
      } catch {
        setDeleteError('삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>My Meal Plans</h1>
        <Link href="/celebrities" className={styles.newPlanBtn}>
          New Plan
        </Link>
      </div>

      {loadStatus === 'loading' && <p className={styles.hint}>Loading…</p>}

      {loadStatus === 'error' && (
        <p role="alert" className={styles.errorText}>
          Failed to load plans. Please refresh.
        </p>
      )}

      {deleteError !== null && (
        <p role="alert" className={styles.errorText}>
          {deleteError}
        </p>
      )}

      {loadStatus === 'success' && plans.length === 0 && (
        <div className={styles.empty}>
          <p>You have no meal plans yet.</p>
          <Link href="/celebrities" className={styles.newPlanBtn}>
            Browse celebrities
          </Link>
        </div>
      )}

      {loadStatus === 'success' && plans.length > 0 && (
        <ul className={styles.list} aria-label="Meal plans">
          {plans.map((plan) => (
            <SwipeablePlanCard
              key={plan.id}
              href={`/plans/${plan.id}`}
              isOpen={openId === plan.id}
              isDeleting={deletingId === plan.id}
              onOpen={() => setOpenId(plan.id)}
              onClose={() => {
                if (openId === plan.id) setOpenId(null);
              }}
              onDeleteRequest={() => void handleDelete(plan.id)}
            >
              <div className={styles.cardBody}>
                <span className={styles.planName}>{plan.name ?? 'Untitled plan'}</span>
                <span className={styles.dates}>
                  {plan.start_date} – {plan.end_date}
                </span>
              </div>
              <span
                className={[
                  styles.statusBadge,
                  plan.status === 'active' ? styles.confirmed : '',
                  plan.status === 'failed' ? styles.failed : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {STATUS_LABEL[plan.status] ?? plan.status}
              </span>
            </SwipeablePlanCard>
          ))}
        </ul>
      )}
    </div>
  );
}
