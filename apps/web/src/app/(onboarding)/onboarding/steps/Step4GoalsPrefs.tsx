'use client';

import type { ReactElement } from 'react';
import { SegmentedControl } from '@celebbase/ui-kit';
import type { SegmentedControlOption } from '@celebbase/ui-kit';
import type { WizardStep4 } from '../wizard-schema.js';
import styles from './steps.module.css';

type PrimaryGoal = NonNullable<WizardStep4['primary_goal']>;
type DietType = NonNullable<WizardStep4['diet_type']>;

const PRIMARY_GOAL_OPTIONS: ReadonlyArray<SegmentedControlOption<PrimaryGoal>> = [
  { value: 'weight_loss', label: '체중 감량' },
  { value: 'muscle_gain', label: '근육 증가' },
  { value: 'maintenance', label: '체중 유지' },
  { value: 'longevity', label: '장수·건강' },
  { value: 'energy', label: '에너지·컨디션' },
];

const DIET_TYPE_OPTIONS: ReadonlyArray<SegmentedControlOption<DietType>> = [
  { value: 'omnivore', label: '제한 없음' },
  { value: 'pescatarian', label: '페스케테리언' },
  { value: 'vegetarian', label: '채식' },
  { value: 'vegan', label: '비건' },
  { value: 'keto', label: '키토' },
  { value: 'paleo', label: '팔레오' },
  { value: 'mediterranean', label: '지중해식' },
];

export interface Step4Props {
  data: Partial<WizardStep4>;
  onChange: (data: Partial<WizardStep4>) => void;
}

export function Step4GoalsPrefs({ data, onChange }: Step4Props): ReactElement {
  const primaryGoal = (data.primary_goal ?? '') as PrimaryGoal | '';
  const dietType = (data.diet_type ?? '') as DietType | '';

  return (
    <div className={styles.root}>
      <div className={styles.segmentField}>
        <div className={styles.segmentLabel} id="primary-goal-label">
          Primary health goal
          <span aria-hidden="true" className={styles.requiredMark}>
            {' '}
            *
          </span>
        </div>
        <div className={styles.segmentWrap}>
          <SegmentedControl<PrimaryGoal>
            id="primary-goal"
            ariaLabel="Primary health goal"
            options={PRIMARY_GOAL_OPTIONS}
            value={primaryGoal as PrimaryGoal}
            onChange={(val) => onChange({ ...data, primary_goal: val })}
            size="sm"
          />
        </div>
      </div>
      <div className={styles.segmentField}>
        <div className={styles.segmentLabel} id="diet-type-label">
          Diet type
          <span aria-hidden="true" className={styles.requiredMark}>
            {' '}
            *
          </span>
        </div>
        <div className={styles.segmentWrap}>
          <SegmentedControl<DietType>
            id="diet-type"
            ariaLabel="Diet type"
            options={DIET_TYPE_OPTIONS}
            value={dietType as DietType}
            onChange={(val) => onChange({ ...data, diet_type: val })}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}
