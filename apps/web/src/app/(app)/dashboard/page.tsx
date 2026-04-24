'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { schemas } from '@celebbase/shared-types';
import type { z } from 'zod';
import { NutritionRing } from '@celebbase/ui-kit';
import { fetcher } from '../../../lib/fetcher.js';
import { useUser } from '../../../lib/user-context.js';
import { IdentitySyncScore } from '../../../features/wellness-log/index.js';
import styles from './dashboard.module.css';

type PlanItem = schemas.MealPlanListResponse['items'][number];
type DailyLogSummary = z.infer<typeof schemas.DailyLogSummaryResponseSchema>;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIsoDate(d);
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function slugToDisplayName(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join(' ');
}

/**
 * Temporary Identity Sync heuristic until BE `persona-match` lands.
 * Weighted blend of meal adherence (70%) + energy/mood proxies (30%) —
 * bounded 0-100. Zero-safe on nullable log metrics.
 */
function computeIdentitySync(summary: DailyLogSummary | null): number | null {
  if (summary === null || summary.total_logs === 0) return null;
  const adherence = summary.completion_rate ?? 0;
  const energyNorm = summary.avg_energy_level !== null ? summary.avg_energy_level / 5 : 0.5;
  const moodNorm = summary.avg_mood !== null ? summary.avg_mood / 5 : 0.5;
  const blend = adherence * 0.7 + energyNorm * 0.15 + moodNorm * 0.15;
  return Math.round(Math.max(0, Math.min(1, blend)) * 100);
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  generating: 'Generating…',
  draft: 'Draft',
  completed: 'Ready',
  active: 'Active',
  failed: 'Failed',
};

export default function DashboardPage(): React.ReactElement {
  const { user } = useUser();
  const today = toIsoDate(new Date());
  const weekStart = nDaysAgo(6);

  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [summary, setSummary] = useState<DailyLogSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetcher('/api/meal-plans', { schema: schemas.MealPlanListResponseSchema })
      .then((data) => {
        if (!cancelled) {
          setPlans(data.items.slice(0, 3));
          setPlansLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setPlansLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetcher(`/api/daily-logs/summary?start_date=${weekStart}&end_date=${today}`, {
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
  }, [today, weekStart]);

  const firstName = user?.display_name.split(' ')[0] ?? null;

  const personaSlug = user?.preferred_celebrity_slug ?? null;
  const personaDisplayName = personaSlug !== null ? slugToDisplayName(personaSlug) : null;

  const adherencePct =
    summary !== null && summary.total_logs > 0 ? Math.round((summary.completion_rate ?? 0) * 100) : 0;
  const energyPct =
    summary !== null && summary.avg_energy_level !== null
      ? Math.round((summary.avg_energy_level / 5) * 100)
      : 0;
  const hasRecoveryData = summary !== null && summary.avg_weight_kg !== null;
  const recoveryPct = hasRecoveryData ? Math.min(100, Math.max(0, Math.round(energyPct))) : 0;

  const identityScore = computeIdentitySync(summary);
  const identityStatus: 'ready' | 'pending' | 'error' = (() => {
    if (summaryLoading) return 'pending';
    if (personaSlug === null) return 'error';
    if (identityScore === null) return 'error';
    return 'ready';
  })();

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.heading}>
          {firstName !== null ? `${greeting()}, ${firstName}` : 'Dashboard'}
        </h1>
      </header>

      <section className={styles.section} aria-labelledby="summary-heading">
        <div className={styles.sectionHeader}>
          <h2 id="summary-heading" className={styles.sectionTitle}>This Week</h2>
          <Link href="/track" className={styles.viewAll}>View track →</Link>
        </div>
        {summaryLoading ? (
          <p className={styles.hint}>Loading…</p>
        ) : summary === null || summary.total_logs === 0 ? (
          <div className={styles.emptyCard}>
            <p className={styles.emptyText}>No logs yet this week.</p>
            <Link href="/track" className={styles.ctaLink}>Start logging →</Link>
          </div>
        ) : (
          <div className={styles.ringStage}>
            <div className={styles.ringCluster}>
              <NutritionRing
                value={adherencePct}
                label="Adherence"
                subLabel={<span>{summary.total_logs} of 7 days</span>}
                tone="brand"
                size="lg"
              />
              <NutritionRing
                value={energyPct}
                label="Energy"
                subLabel={
                  <span>
                    {summary.avg_energy_level !== null ? summary.avg_energy_level.toFixed(1) : '—'} / 5
                  </span>
                }
                tone="persona"
                size="lg"
              />
              {hasRecoveryData ? (
                <NutritionRing
                  value={recoveryPct}
                  label="Recovery"
                  subLabel={
                    <span>
                      {summary.avg_weight_kg !== null ? summary.avg_weight_kg.toFixed(1) : '—'} kg
                    </span>
                  }
                  tone="brand"
                  size="lg"
                />
              ) : (
                <div className={styles.recoveryFallback}>
                  <span className={styles.recoveryFallbackTitle}>Recovery</span>
                  <span className={styles.recoveryFallbackHint}>
                    Log weight or sleep to unlock recovery tracking.
                  </span>
                </div>
              )}
            </div>
            <IdentitySyncScore
              className={styles.identitySync}
              score={identityScore}
              personaDisplayName={personaDisplayName}
              status={identityStatus}
            />
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="plans-heading">
        <div className={styles.sectionHeader}>
          <h2 id="plans-heading" className={styles.sectionTitle}>Recent Plans</h2>
          <Link href="/plans" className={styles.viewAll}>View all</Link>
        </div>

        {plansLoading && <p className={styles.hint}>Loading…</p>}

        {!plansLoading && plans.length === 0 && (
          <div className={styles.emptyCard}>
            <p className={styles.emptyText}>No meal plans yet.</p>
            <Link href="/celebrities" className={styles.ctaLink}>Browse celebrities →</Link>
          </div>
        )}

        {!plansLoading && plans.length > 0 && (
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
            <span className={styles.exploreDesc}>
              Browse diets followed by top athletes and celebrities
            </span>
          </Link>
          <Link href="/celebrities" className={styles.exploreCard}>
            <span className={styles.exploreLabel}>Generate a Plan</span>
            <span className={styles.exploreDesc}>
              Pick a celebrity diet and generate a personalised meal plan
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
