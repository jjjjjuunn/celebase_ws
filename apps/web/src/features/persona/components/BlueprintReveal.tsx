'use client';

import type { ReactElement } from 'react';
import { Button, MealCard, InstacartCartPreview, SourceTrackingBadge } from '@celebbase/ui-kit';
import { IdentitySyncScore } from '../../wellness-log/IdentitySyncScore.js';
import type { WizardForm } from '../../../app/(onboarding)/onboarding/wizard-schema.js';
import styles from './BlueprintReveal.module.css';

export type PersonaMatchState =
  | { status: 'pending' }
  | { status: 'ready'; matchScore: number; rationale: string | null }
  | { status: 'error'; reason: 'timeout' | 'unavailable' | 'unknown' };

export interface BlueprintRevealProps {
  form: WizardForm;
  personaDisplayName: string | null;
  personaSlug: string | null;
  personaMatch: PersonaMatchState;
  isSubmitting: boolean;
  submitError: string | null;
  onStart: () => void;
  onRetryMatch: () => void;
}

interface TdeeBreakdown {
  bmr: number;
  tdee: number;
}

const ACTIVITY_MULTIPLIER: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

function calcMifflinStJeorTdee(form: WizardForm): TdeeBreakdown | null {
  const { birth_year, sex } = form.step1;
  const { height_cm, weight_kg, activity_level } = form.step2;
  if (
    typeof birth_year !== 'number' ||
    typeof height_cm !== 'number' ||
    typeof weight_kg !== 'number' ||
    typeof activity_level !== 'string'
  ) {
    return null;
  }
  const now = new Date();
  const age = Math.max(12, now.getUTCFullYear() - birth_year);
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  let bmr: number;
  if (sex === 'male') {
    bmr = base + 5;
  } else if (sex === 'female') {
    bmr = base - 161;
  } else {
    bmr = base - 78;
  }
  const multiplier = ACTIVITY_MULTIPLIER[activity_level] ?? 1.375;
  const tdee = bmr * multiplier;
  return { bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

function scoreFromMatch(match: PersonaMatchState): number | null {
  if (match.status === 'ready') {
    return match.matchScore;
  }
  return null;
}

function identityStatus(match: PersonaMatchState): 'ready' | 'pending' | 'error' {
  if (match.status === 'ready') return 'ready';
  if (match.status === 'pending') return 'pending';
  return 'error';
}

export function BlueprintReveal(props: BlueprintRevealProps): ReactElement {
  const {
    form,
    personaDisplayName,
    personaSlug,
    personaMatch,
    isSubmitting,
    submitError,
    onStart,
    onRetryMatch,
  } = props;

  const breakdown = calcMifflinStJeorTdee(form);
  const matchScore = scoreFromMatch(personaMatch);
  const syncStatus = identityStatus(personaMatch);

  const headline = personaDisplayName
    ? `Your ${personaDisplayName} blueprint`
    : 'Your blueprint';

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h2 className={styles.headline}>{headline}</h2>
        <p className={styles.subhead}>
          Here&apos;s the baseline we built from your answers. You can change anything later.
        </p>
      </header>

      <section className={styles.scorePanel} aria-label="Identity sync with your persona">
        <IdentitySyncScore
          score={matchScore}
          personaDisplayName={personaDisplayName}
          status={syncStatus}
        />
        {personaMatch.status === 'error' ? (
          <button
            type="button"
            className={styles.retryLink}
            onClick={onRetryMatch}
          >
            Retry sync
          </button>
        ) : null}
      </section>

      <section className={styles.numbers}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Daily energy target</span>
          <span className={styles.metricValue}>
            {breakdown ? `${String(breakdown.tdee)} kcal` : '—'}
          </span>
          <span className={styles.metricDetail}>
            {breakdown
              ? `BMR ${String(breakdown.bmr)} · Mifflin-St Jeor`
              : 'Complete earlier steps to calculate'}
          </span>
        </div>
      </section>

      <section className={styles.preview} aria-label="Meal preview">
        <h3 className={styles.sectionHeading}>First meal on your plan</h3>
        <MealCard
          title={personaDisplayName ? `${personaDisplayName}-style breakfast bowl` : 'Signature breakfast bowl'}
          celebrityTag={personaDisplayName ?? undefined}
          mealType="Breakfast"
          kcal={breakdown ? Math.round(breakdown.tdee * 0.3) : undefined}
          safetyStatus="green"
          sourceBadge={
            personaSlug ? (
              <SourceTrackingBadge
                sourceLabel={`${personaDisplayName ?? 'Persona'} public interview`}
                href={`/celebrities/${personaSlug}`}
                verifiedAt="2025-11-12"
              />
            ) : null
          }
        />
      </section>

      <section className={styles.preview} aria-label="Pantry cart preview">
        <h3 className={styles.sectionHeading}>Pantry cart preview</h3>
        <InstacartCartPreview
          items={[
            { id: 'oats', name: 'Rolled oats', quantity: 1, unit: 'bag', priceCents: 499 },
            { id: 'berries', name: 'Blueberries', quantity: 2, unit: 'pint', priceCents: 1198 },
            { id: 'almonds', name: 'Sliced almonds', quantity: 1, unit: 'jar', priceCents: 699 },
          ]}
          subtotalCents={2396}
          status="ready"
          footer={
            <span className={styles.cartFootnote}>
              We&apos;ll confirm exact items and swaps after you finish onboarding.
            </span>
          }
        />
      </section>

      <p role="note" className={styles.disclaimer}>
        This information is for educational purposes only and is not intended as
        medical advice. Please consult a qualified professional before changing
        your diet or training.
      </p>

      {submitError !== null ? (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      ) : null}

      <Button
        type="button"
        size="md"
        variant="primary"
        onClick={onStart}
        loading={isSubmitting}
      >
        {isSubmitting ? 'Saving your blueprint…' : 'Start my blueprint'}
      </Button>
    </div>
  );
}
