'use client';

import { useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { Input, Chip } from '@celebbase/ui-kit';
import type { WizardStep3 } from '../wizard-schema.js';
import styles from './steps.module.css';

const PHI_DISCLAIMER =
  'This information is for personalizing your meal plan only. It is never shared, sold, or used for any purpose other than generating your recommendations.';

interface TagInputProps {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  helperText?: string;
}

function TagInput({ id, label, values, onChange, helperText }: TagInputProps): ReactElement {
  const [draft, setDraft] = useState('');

  const addTag = (): void => {
    const trimmed = draft.trim();
    if (trimmed.length > 0 && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setDraft('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div>
      {values.length > 0 ? (
        <div role="list" aria-label={`${label} tags`} className={styles.tagList}>
          {values.map((val, i) => (
            <span key={val} role="listitem">
              <Chip
                label={val}
                size="sm"
                onRemove={() => onChange(values.filter((_, j) => j !== i))}
              />
            </span>
          ))}
        </div>
      ) : null}
      <Input
        id={id}
        label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag()}
        helperText={helperText ?? 'Type and press Enter to add'}
      />
    </div>
  );
}

export interface Step3Props {
  data: WizardStep3;
  onChange: (data: WizardStep3) => void;
}

export function Step3HealthInfo({ data, onChange }: Step3Props): ReactElement {
  return (
    <div className={styles.root}>
      <p className={styles.disclaimer}>{PHI_DISCLAIMER}</p>
      <TagInput
        id="allergies"
        label="Allergies"
        values={data.allergies}
        onChange={(allergies) => onChange({ ...data, allergies })}
      />
      <TagInput
        id="intolerances"
        label="Food intolerances"
        values={data.intolerances}
        onChange={(intolerances) => onChange({ ...data, intolerances })}
      />
      <TagInput
        id="medical-conditions"
        label="Medical conditions"
        values={data.medical_conditions}
        onChange={(medical_conditions) => onChange({ ...data, medical_conditions })}
        helperText="Type and press Enter to add (optional)"
      />
      <TagInput
        id="medications"
        label="Medications"
        values={data.medications}
        onChange={(medications) => onChange({ ...data, medications })}
        helperText="Type and press Enter to add (optional)"
      />
    </div>
  );
}
