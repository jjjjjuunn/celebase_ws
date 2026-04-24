'use client';

import type { ReactElement } from 'react';
import { Input, SegmentedControl } from '@celebbase/ui-kit';
import type { SegmentedControlOption } from '@celebbase/ui-kit';
import type { WizardStep2 } from '../wizard-schema.js';
import { DrumPicker } from './DrumPicker.js';
import styles from './steps.module.css';

const HEIGHT_MIN_CM = 140;
const HEIGHT_MAX_CM = 220;
const HEIGHT_DEFAULT_CM = 170;
const WEIGHT_MIN_KG = 35;
const WEIGHT_MAX_KG = 200;
const WEIGHT_DEFAULT_KG = 70;

type ActivityLevel = NonNullable<WizardStep2['activity_level']>;

const ACTIVITY_OPTIONS: ReadonlyArray<SegmentedControlOption<ActivityLevel>> = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];

const ACTIVITY_DETAIL: Record<ActivityLevel, { icon: string; summary: string; blurb: string }> = {
  sedentary: {
    icon: '\u{1F6CB}\uFE0F',
    summary: 'Mostly at rest',
    blurb: 'No judgment \u2014 we\u2019ll design around your natural rhythm.',
  },
  light: {
    icon: '\u{1F343}',
    summary: '1\u20133 easy days a week',
    blurb: 'A gentle base. Small habits, steady gains.',
  },
  moderate: {
    icon: '\u{1F6B4}',
    summary: '3\u20135 steady days a week',
    blurb: 'You\u2019ve found a rhythm \u2014 your body knows what it needs.',
  },
  active: {
    icon: '\u{1F525}',
    summary: '6\u20137 days, real effort',
    blurb: 'You put in the work \u2014 let\u2019s make sure the food earns it.',
  },
  very_active: {
    icon: '\u{1F3C6}',
    summary: 'Training life + physical job',
    blurb: 'Elite tier. Recovery will be our quiet obsession.',
  },
};

function heightHelper(height: number | undefined): string | undefined {
  if (height === undefined) return undefined;
  if (height < 140 || height > 220) return undefined;
  return 'Noted \u2014 we\u2019ll tailor portions to your frame.';
}

function weightHelper(height: number | undefined, weight: number | undefined): string | undefined {
  if (weight === undefined) return undefined;
  if (height === undefined || height < 100) {
    return 'Got it. Add your height for a sharper starting point.';
  }
  const bmi = weight / (height / 100) ** 2;
  if (bmi < 18.5) return 'We\u2019ll focus on steady, nourishing energy intake.';
  if (bmi < 25) return 'You\u2019re in a healthy range \u2014 let\u2019s help you stay strong.';
  if (bmi < 30) return 'We\u2019ll design a plan that feels sustainable, not restrictive.';
  return 'Every small step counts \u2014 we\u2019re here for the long game.';
}

function waistHelper(waist: number | undefined): string {
  if (waist === undefined) return 'Optional \u2014 sharpens our metabolic estimate.';
  return 'Thanks \u2014 this helps us fine-tune your calorie target.';
}

export interface Step2Props {
  data: Partial<WizardStep2>;
  onChange: (data: Partial<WizardStep2>) => void;
}

export function Step2BodyMetrics({ data, onChange }: Step2Props): ReactElement {
  const heightHelperText = heightHelper(data.height_cm);
  const weightHelperText = weightHelper(data.height_cm, data.weight_kg);
  const activityDetail =
    data.activity_level !== undefined ? ACTIVITY_DETAIL[data.activity_level] : undefined;
  return (
    <div className={styles.root}>
      <DrumPicker
        id="height-cm"
        label="Height"
        unit="cm"
        required
        min={HEIGHT_MIN_CM}
        max={HEIGHT_MAX_CM}
        step={1}
        defaultValue={HEIGHT_DEFAULT_CM}
        value={data.height_cm}
        onChange={(val) => onChange({ ...data, height_cm: val })}
        {...(heightHelperText !== undefined ? { helperText: heightHelperText } : {})}
      />
      <DrumPicker
        id="weight-kg"
        label="Weight"
        unit="kg"
        required
        min={WEIGHT_MIN_KG}
        max={WEIGHT_MAX_KG}
        step={1}
        defaultValue={WEIGHT_DEFAULT_KG}
        value={data.weight_kg}
        onChange={(val) => onChange({ ...data, weight_kg: val })}
        {...(weightHelperText !== undefined ? { helperText: weightHelperText } : {})}
      />
      <Input
        id="waist-cm"
        label="Waist circumference (cm)"
        type="number"
        min={40}
        max={200}
        value={data.waist_cm !== undefined ? String(data.waist_cm) : ''}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          onChange({ ...data, waist_cm: Number.isNaN(val) ? undefined : val });
        }}
        helperText={waistHelper(data.waist_cm)}
      />
      <div className={styles.segmentField}>
        <span className={styles.segmentLabel} id="activity-level-label">
          Activity level
          <span aria-hidden="true" className={styles.requiredMark}>
            *
          </span>
        </span>
        <SegmentedControl<ActivityLevel>
          id="activity-level"
          ariaLabel="Activity level"
          options={ACTIVITY_OPTIONS}
          value={(data.activity_level ?? '') as ActivityLevel}
          onChange={(val) => onChange({ ...data, activity_level: val })}
          className={styles.segmentFullWidth}
        />
        {activityDetail ? (
          <div
            key={data.activity_level}
            className={styles.activityDetailCard}
            role="status"
            aria-live="polite"
          >
            <span className={styles.activityDetailIcon} aria-hidden="true">
              {activityDetail.icon}
            </span>
            <span className={styles.activityDetailText}>
              <span className={styles.activityDetailSummary}>{activityDetail.summary}</span>
              <span className={styles.activityDetailBlurb}>{activityDetail.blurb}</span>
            </span>
          </div>
        ) : (
          <span className={styles.segmentHelper}>
            Pick the range closest to your weekly routine.
          </span>
        )}
      </div>
    </div>
  );
}
