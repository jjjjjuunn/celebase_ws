'use client';

import type { ReactElement } from 'react';
import { SelectField } from '@celebbase/ui-kit';
import type { SelectFieldOption } from '@celebbase/ui-kit';
import type { WizardStep4 } from '../wizard-schema.js';
import styles from './steps.module.css';

const PRIMARY_GOAL_OPTIONS: ReadonlyArray<SelectFieldOption> = [
  { value: 'weight_loss', label: 'Weight Loss' },
  { value: 'muscle_gain', label: 'Muscle Gain' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'longevity', label: 'Longevity & Healthy Aging' },
  { value: 'energy', label: 'Energy & Vitality' },
];

const DIET_TYPE_OPTIONS: ReadonlyArray<SelectFieldOption> = [
  { value: 'omnivore', label: 'Omnivore' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'keto', label: 'Keto' },
  { value: 'paleo', label: 'Paleo' },
  { value: 'mediterranean', label: 'Mediterranean' },
];

export interface Step4Props {
  data: Partial<WizardStep4>;
  onChange: (data: Partial<WizardStep4>) => void;
}

export function Step4GoalsPrefs({ data, onChange }: Step4Props): ReactElement {
  return (
    <div className={styles.root}>
      <SelectField
        id="primary-goal"
        label="Primary health goal"
        required
        options={PRIMARY_GOAL_OPTIONS}
        value={data.primary_goal ?? ''}
        onChange={(val) =>
          onChange({ ...data, primary_goal: val as WizardStep4['primary_goal'] })
        }
        placeholder="Select your goal..."
      />
      <SelectField
        id="diet-type"
        label="Diet type"
        required
        options={DIET_TYPE_OPTIONS}
        value={data.diet_type ?? ''}
        onChange={(val) =>
          onChange({ ...data, diet_type: val as WizardStep4['diet_type'] })
        }
        placeholder="Select diet type..."
      />
    </div>
  );
}
