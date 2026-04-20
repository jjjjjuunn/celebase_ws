'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { schemas } from '@celebbase/shared-types';
import { fetcher } from '../../../lib/fetcher.js';
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
            <li key={plan.id}>
              <Link href={`/plans/${plan.id}`} className={styles.card}>
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
