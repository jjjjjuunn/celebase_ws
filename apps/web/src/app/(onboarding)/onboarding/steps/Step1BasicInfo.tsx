'use client';

import type { ReactElement } from 'react';
import { Input, SelectField } from '@celebbase/ui-kit';
import type { SelectFieldOption } from '@celebbase/ui-kit';
import type { WizardStep1 } from '../wizard-schema.js';
import styles from './steps.module.css';

const SEX_OPTIONS: ReadonlyArray<SelectFieldOption> = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export interface Step1Props {
  data: Partial<WizardStep1>;
  onChange: (data: Partial<WizardStep1>) => void;
}

export function Step1BasicInfo({ data, onChange }: Step1Props): ReactElement {
  return (
    <div className={styles.root}>
      <Input
        id="display-name"
        label="Display name"
        required
        value={data.display_name ?? ''}
        maxLength={100}
        onChange={(e) => onChange({ ...data, display_name: e.target.value })}
        helperText="What should we call you?"
      />
      <Input
        id="birth-year"
        label="Birth year"
        required
        type="number"
        min={1920}
        max={2013}
        value={data.birth_year !== undefined ? String(data.birth_year) : ''}
        onChange={(e) => {
          const val = parseInt(e.target.value, 10);
          onChange({ ...data, birth_year: Number.isNaN(val) ? undefined : val });
        }}
      />
      <SelectField
        id="sex"
        label="Sex"
        required
        options={SEX_OPTIONS}
        value={data.sex ?? ''}
        onChange={(val) => onChange({ ...data, sex: val as WizardStep1['sex'] })}
        placeholder="Select..."
      />
    </div>
  );
}
