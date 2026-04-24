'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { Chip } from '@celebbase/ui-kit';
import type { WizardStep4 } from '../wizard-schema.js';
import styles from './steps.module.css';

type PrimaryGoal = NonNullable<WizardStep4['primary_goal']>;
type DietType = NonNullable<WizardStep4['diet_type']>;

interface ChipOption<T extends string> {
  value: T;
  label: string;
}

const PRIMARY_GOAL_OPTIONS: ReadonlyArray<ChipOption<PrimaryGoal>> = [
  { value: 'weight_loss', label: 'Weight loss' },
  { value: 'muscle_gain', label: 'Build muscle' },
  { value: 'maintenance', label: 'Maintain weight' },
  { value: 'longevity', label: 'Longevity' },
  { value: 'energy', label: 'Daily energy' },
];

const DIET_TYPE_OPTIONS: ReadonlyArray<ChipOption<DietType>> = [
  { value: 'omnivore', label: 'No restrictions' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'keto', label: 'Keto' },
  { value: 'paleo', label: 'Paleo' },
  { value: 'mediterranean', label: 'Mediterranean' },
];

type SectionKey = 'primary_goal' | 'diet_type';

interface SingleChipFieldProps<T extends string> {
  id: string;
  label: string;
  addHint: string;
  options: ReadonlyArray<ChipOption<T>>;
  value: T | undefined;
  onChange: (value: T) => void;
  expanded: boolean;
  onToggle: () => void;
  onSelected: () => void;
}

function SingleChipField<T extends string>({
  id,
  label,
  addHint,
  options,
  value,
  onChange,
  expanded,
  onToggle,
  onSelected,
}: SingleChipFieldProps<T>): ReactElement {
  const selectedOption = options.find((o) => o.value === value);

  const handleSelect = (val: T): void => {
    onChange(val);
    onSelected();
  };

  return (
    <section
      className={styles.accordionSection}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <button
        type="button"
        className={styles.accordionHeader}
        onClick={onToggle}
        aria-expanded={expanded ? 'true' : 'false'}
        aria-controls={`${id}-body`}
      >
        <span className={styles.accordionHeaderMain}>
          <span className={styles.accordionLabel} id={`${id}-label`}>
            {label}
            <span aria-hidden="true" className={styles.requiredMark}>
              *
            </span>
          </span>
          {selectedOption ? (
            <span className={styles.accordionSummary} aria-label={`${label} selected`}>
              <span className={styles.summaryChip}>{selectedOption.label}</span>
            </span>
          ) : (
            <span className={styles.accordionAddHint}>{addHint}</span>
          )}
        </span>
      </button>

      <div
        id={`${id}-body`}
        className={styles.accordionBody}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div className={styles.accordionBodyInner}>
          <div className={styles.accordionBodyContent}>
            <div className={styles.chipGrid} role="group" aria-labelledby={`${id}-label`}>
              {options.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  size="sm"
                  selected={option.value === value}
                  onToggle={() => handleSelect(option.value)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export interface Step4Props {
  data: Partial<WizardStep4>;
  onChange: (data: Partial<WizardStep4>) => void;
}

export function Step4GoalsPrefs({ data, onChange }: Step4Props): ReactElement {
  const [expandedKey, setExpandedKey] = useState<SectionKey | null>(() =>
    data.primary_goal ? null : 'primary_goal',
  );

  const toggle = (key: SectionKey) => (): void => {
    setExpandedKey((current) => (current === key ? null : key));
  };

  return (
    <div className={styles.root}>
      <SingleChipField<PrimaryGoal>
        id="primary-goal"
        label="Primary health goal"
        addHint="Choose your goal"
        options={PRIMARY_GOAL_OPTIONS}
        value={data.primary_goal}
        onChange={(primary_goal) => onChange({ ...data, primary_goal })}
        expanded={expandedKey === 'primary_goal'}
        onToggle={toggle('primary_goal')}
        onSelected={() => setExpandedKey(data.diet_type ? null : 'diet_type')}
      />
      <SingleChipField<DietType>
        id="diet-type"
        label="Diet type"
        addHint="Choose your diet"
        options={DIET_TYPE_OPTIONS}
        value={data.diet_type}
        onChange={(diet_type) => onChange({ ...data, diet_type })}
        expanded={expandedKey === 'diet_type'}
        onToggle={toggle('diet_type')}
        onSelected={() => setExpandedKey(null)}
      />
    </div>
  );
}
