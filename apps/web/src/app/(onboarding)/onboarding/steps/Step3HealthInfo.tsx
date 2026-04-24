'use client';

import { useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { Input, Chip } from '@celebbase/ui-kit';
import type { WizardStep3 } from '../wizard-schema.js';
import styles from './steps.module.css';

const PHI_DISCLAIMER =
  'This information is for personalizing your meal plan only. It is never shared, sold, or used for any purpose other than generating your recommendations.';

const ALLERGY_OPTIONS = ['견과류', '갑각류', '유제품', '밀/글루텐', '달걀', '생선', '콩'] as const;
const INTOLERANCE_OPTIONS = ['유당불내증', '글루텐 과민', 'FODMAP', 'MSG'] as const;
const CONDITION_OPTIONS = ['당뇨', '고혈압', '고지혈증', '갑상선 질환', '위염/역류'] as const;
const MEDICATION_OPTIONS = ['메트포르민', '스타틴', '혈압약', '갑상선약'] as const;

interface ChipHybridInputProps {
  id: string;
  label: string;
  options: ReadonlyArray<string>;
  value: string[];
  onChange: (value: string[]) => void;
  helperText?: string;
  otherPlaceholder?: string;
}

function ChipHybridInput({
  id,
  label,
  options,
  value,
  onChange,
  helperText,
  otherPlaceholder,
}: ChipHybridInputProps): ReactElement {
  const [draft, setDraft] = useState('');

  const toggle = (option: string): void => {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
    } else {
      onChange([...value, option]);
    }
  };

  const removeAt = (index: number): void => {
    onChange(value.filter((_, i) => i !== index));
  };

  const addCustom = (): void => {
    const trimmed = draft.trim();
    if (trimmed.length > 0 && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setDraft('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCustom();
    }
  };

  const customValues = value.filter((v) => !options.includes(v));

  return (
    <div>
      <div className={styles.chipGroupLabel} id={`${id}-label`}>
        {label}
      </div>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className={styles.chipGrid}
      >
        {options.map((option) => (
          <Chip
            key={option}
            label={option}
            size="sm"
            selected={value.includes(option)}
            onToggle={() => toggle(option)}
          />
        ))}
      </div>
      {customValues.length > 0 ? (
        <div role="list" aria-label={`${label} 직접 입력`} className={styles.tagList}>
          {customValues.map((val) => {
            const index = value.indexOf(val);
            return (
              <span key={val} role="listitem">
                <Chip
                  label={val}
                  size="sm"
                  onRemove={() => removeAt(index)}
                />
              </span>
            );
          })}
        </div>
      ) : null}
      <div className={styles.ghostInputRow}>
        <Input
          id={`${id}-other`}
          label="기타 직접 입력"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addCustom()}
          helperText={helperText ?? 'Enter 로 추가'}
          placeholder={otherPlaceholder ?? '목록에 없다면 직접 입력'}
        />
      </div>
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
      <ChipHybridInput
        id="allergies"
        label="Allergies"
        options={ALLERGY_OPTIONS}
        value={data.allergies}
        onChange={(allergies) => onChange({ ...data, allergies })}
      />
      <ChipHybridInput
        id="intolerances"
        label="Food intolerances"
        options={INTOLERANCE_OPTIONS}
        value={data.intolerances}
        onChange={(intolerances) => onChange({ ...data, intolerances })}
      />
      <ChipHybridInput
        id="medical-conditions"
        label="Medical conditions"
        options={CONDITION_OPTIONS}
        value={data.medical_conditions}
        onChange={(medical_conditions) => onChange({ ...data, medical_conditions })}
        helperText="해당 사항이 없다면 비워두세요"
      />
      <ChipHybridInput
        id="medications"
        label="Medications"
        options={MEDICATION_OPTIONS}
        value={data.medications}
        onChange={(medications) => onChange({ ...data, medications })}
        helperText="해당 사항이 없다면 비워두세요"
      />
    </div>
  );
}
