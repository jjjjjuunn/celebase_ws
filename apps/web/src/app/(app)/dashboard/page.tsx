'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { schemas } from '@celebbase/shared-types';
import { fetcher } from '../../../lib/fetcher.js';
import styles from './dashboard.module.css';

type PlanItem = schemas.MealPlanListResponse['items'][number];

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  generating: 'Generating…',
  draft: 'Draft',
  completed: 'Ready',
  active: 'Active',
  failed: 'Failed',
};

export default function DashboardPage(): React.ReactElement {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'done'>('loading');

  useEffect(() => {
    let cancelled = false;
    fetcher('/api/meal-plans', { schema: schemas.MealPlanListResponseSchema })
      .then((data) => {
        if (!cancelled) {
          setPlans(data.items.slice(0, 3));
          setLoadStatus('done');
        }
      })
      .catch(() => {
        if (!cancelled) setLoadStatus('done');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Dashboard</h1>

      <section className={styles.section} aria-labelledby="plans-heading">
        <div className={styles.sectionHeader}>
          <h2 id="plans-heading" className={styles.sectionTitle}>Recent Plans</h2>
          <Link href="/plans" className={styles.viewAll}>View all</Link>
        </div>

        {loadStatus === 'loading' && <p className={styles.hint}>Loading…</p>}

        {loadStatus === 'done' && plans.length === 0 && (
          <div className={styles.emptyCard}>
            <p className={styles.emptyText}>No meal plans yet.</p>
            <Link href="/celebrities" className={styles.ctaLink}>Browse celebrities →</Link>
          </div>
        )}

        {loadStatus === 'done' && plans.length > 0 && (
          <ul className={styles.planList}>
            {plans.map((plan) => (
              <li key={plan.id}>
                <Link href={`/plans/${plan.id}`} className={styles.planCard}>
                  <span className={styles.planName}>{plan.name ?? 'Untitled plan'}</span>
                  <span className={styles.planMeta}>
                    {plan.start_date} – {plan.end_date}
                  </span>
                  <span className={styles.planStatus}>
                    {STATUS_LABEL[plan.status] ?? plan.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="explore-heading">
        <h2 id="explore-heading" className={styles.sectionTitle}>Explore</h2>
        <div className={styles.exploreGrid}>
          <Link href="/celebrities" className={styles.exploreCard}>
            <span className={styles.exploreLabel}>Celebrity Diets</span>
            <span className={styles.exploreDesc}>Browse diets followed by top athletes and celebrities</span>
          </Link>
          <Link href="/celebrities" className={styles.exploreCard}>
            <span className={styles.exploreLabel}>Generate a Plan</span>
            <span className={styles.exploreDesc}>Pick a celebrity diet and generate a personalised meal plan</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
