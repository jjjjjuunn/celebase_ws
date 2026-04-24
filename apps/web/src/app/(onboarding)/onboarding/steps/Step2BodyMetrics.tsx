'use client';

import type { ReactElement } from 'react';
import { Input, SelectField } from '@celebbase/ui-kit';
import type { SelectFieldOption } from '@celebbase/ui-kit';
import type { WizardStep2 } from '../wizard-schema.js';
import styles from './steps.module.css';

const ACTIVITY_OPTIONS: ReadonlyArray<SelectFieldOption> = [
  { value: 'sedentary', label: 'Sedentary (little or no exercise)' },
  { value: 'light', label: 'Light (1–3 days/week)' },
  { value: 'moderate', label: 'Moderate (3–5 days/week)' },
  { value: 'active', label: 'Active (6–7 days/week)' },
  { value: 'very_active', label: 'Very Active (hard exercise + physical job)' },
];

export interface Step2Props {
  data: Partial<WizardStep2>;
  onChange: (data: Partial<WizardStep2>) => void;
}

export function Step2BodyMetrics({ data, onChange }: Step2Props): ReactElement {
  return (
    <div className={styles.root}>
      <Input
        id="height-cm"
        label="Height (cm)"
        required
        type="number"
        min={100}
        max={250}
        value={data.height_cm !== undefined ? String(data.height_cm) : ''}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          onChange({ ...data, height_cm: Number.isNaN(val) ? undefined : val });
        }}
      />
      <Input
        id="weight-kg"
        label="Weight (kg)"
        required
        type="number"
        min={30}
        max={300}
        value={data.weight_kg !== undefined ? String(data.weight_kg) : ''}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          onChange({ ...data, weight_kg: Number.isNaN(val) ? undefined : val });
        }}
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
        helperText="Optional — used for metabolic calculations"
      />
      <SelectField
        id="activity-level"
        label="Activity level"
        required
        options={ACTIVITY_OPTIONS}
        value={data.activity_level ?? ''}
        onChange={(val) =>
          onChange({ ...data, activity_level: val as WizardStep2['activity_level'] })
        }
        placeholder="Select activity level..."
      />
    </div>
  );
}
