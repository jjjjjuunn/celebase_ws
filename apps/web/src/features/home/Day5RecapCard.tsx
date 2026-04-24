'use client';

// Plan 22 · Phase H2 — Day 5 WOW Moment recap card.
// Renders at the top of /home when GET /api/trial/recap returns trial_day === 5
// and the user has not dismissed the card. Aims to convert trial → paid by
// showing alignment progress + a 3-meal "next week" teaser + /account/subscription CTA.

import type { ReactElement } from 'react';
import Link from 'next/link';
import { schemas } from '@celebbase/shared-types';
import type { z } from 'zod';
import { AlignmentRing } from './AlignmentRing.js';
import styles from './Day5RecapCard.module.css';

type TrialRecap = z.infer<typeof schemas.TrialRecapResponseSchema>;

export interface Day5RecapCardProps {
  recap: TrialRecap;
  celebrityDisplayName: string | null;
  onDismiss: () => void;
}

const MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  smoothie: 'Smoothie',
};

export function Day5RecapCard(props: Day5RecapCardProps): ReactElement {
  const { recap, celebrityDisplayName, onDismiss } = props;
  const alignment = recap.alignment_pct;
  const preview = recap.next_week_preview;

  const headline =
    alignment !== null && celebrityDisplayName !== null
      ? `You're ${String(alignment)}% aligned with ${celebrityDisplayName} this week`
      : alignment !== null
        ? `You're ${String(alignment)}% aligned this week`
        : celebrityDisplayName !== null
          ? `Your ${celebrityDisplayName} week so far`
          : 'Your first week so far';

  return (
    <section
      className={styles.card}
      role="region"
      aria-labelledby="day5-recap-title"
    >
      <header className={styles.header}>
        <span className={styles.eyebrow}>Day 5 · trial recap</span>
        <h2 id="day5-recap-title" className={styles.title}>
          {headline}
        </h2>
      </header>

      <div className={styles.hero}>
        <AlignmentRing
          value={alignment}
          personaDisplayName={celebrityDisplayName}
          size="lg"
        />
        <p className={styles.heroCopy}>
          {alignment !== null && alignment >= 70
            ? 'You are building real rhythm. Lock in next week to keep momentum.'
            : alignment !== null
              ? 'Exploration phase — next week the plan adapts around what stuck.'
              : 'Log a few meals to unlock your personalized alignment score.'}
        </p>
      </div>

      {preview.length > 0 && (
        <div className={styles.previewBlock} aria-label="Next meals preview">
          <span className={styles.previewLabel}>Next up</span>
          <ul className={styles.previewList}>
            {preview.map((entry, idx) => {
              const label =
                MEAL_TYPE_LABEL[entry.meal.meal_type] ?? entry.meal.meal_type;
              const kcal = entry.meal.adjusted_nutrition?.calories ?? null;
              return (
                <li
                  key={`${entry.date}-${entry.meal.meal_type}-${String(idx)}`}
                  className={styles.previewItem}
                >
                  <span className={styles.previewMealType}>{label}</span>
                  <span className={styles.previewDate}>{entry.date}</span>
                  {kcal !== null && (
                    <span className={styles.previewKcal}>
                      {String(Math.round(kcal))} kcal
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className={styles.ctaRow}>
        <Link href={recap.cta_target} className={styles.primaryCta}>
          Continue with Celebase →
        </Link>
        <button
          type="button"
          className={styles.ghostCta}
          onClick={onDismiss}
        >
          Keep exploring
        </button>
      </div>
    </section>
  );
}
