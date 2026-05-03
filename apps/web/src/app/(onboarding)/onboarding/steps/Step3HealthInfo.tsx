'use client';

import { useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { Input, Chip } from '@celebbase/ui-kit';
import type { WizardStep3 } from '../wizard-schema.js';
import styles from './steps.module.css';

const PHI_DISCLAIMER =
  'This information is for personalizing your meal plan only. It is never shared, sold, or used for any purpose other than generating your recommendations.';

const ALLERGY_OPTIONS = [
  'Tree nuts',
  'Peanuts',
  'Shellfish',
  'Dairy',
  'Wheat / gluten',
  'Eggs',
  'Fish',
  'Soy',
] as const;
const INTOLERANCE_OPTIONS = [
  'Lactose',
  'Gluten sensitivity',
  'FODMAP',
  'MSG',
  'Caffeine',
] as const;
const CONDITION_OPTIONS = [
  'Diabetes',
  'Hypertension',
  'High cholesterol',
  'Thyroid condition',
  'GERD / gastritis',
  'PCOS',
] as const;
const MEDICATION_OPTIONS = [
  'Metformin',
  'Statins',
  'Blood pressure meds',
  'Thyroid meds',
  'SSRI / SNRI',
] as const;

type SectionKey = 'allergies' | 'intolerances' | 'conditions' | 'medications';

interface AccordionMultiFieldProps {
  id: string;
  label: string;
  addHint: string;
  options: ReadonlyArray<string>;
  value: string[];
  onChange: (value: string[]) => void;
  customPlaceholder: string;
  expanded: boolean;
  onToggle: () => void;
}

function AccordionMultiField({
  id,
  label,
  addHint,
  options,
  value,
  onChange,
  customPlaceholder,
  expanded,
  onToggle,
}: AccordionMultiFieldProps): ReactElement {
  const [draft, setDraft] = useState('');
  const composingRef = useRef(false);

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
    if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCustom();
    }
  };

  const handleCompositionStart = (): void => {
    composingRef.current = true;
  };
  const handleCompositionEnd = (): void => {
    composingRef.current = false;
  };

  const customValues = value.filter((v) => !options.includes(v));

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
          </span>
          {value.length === 0 ? (
            <span className={styles.accordionAddHint}>{addHint}</span>
          ) : (
            <span className={styles.accordionSummary} aria-label={`${label} selected`}>
              {value.map((v) => (
                <span key={v} className={styles.summaryChip}>
                  {v}
                </span>
              ))}
            </span>
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
                  key={option}
                  label={option}
                  size="sm"
                  selected={value.includes(option)}
                  onToggle={() => toggle(option)}
                />
              ))}
            </div>

            {customValues.length > 0 ? (
              <div
                role="list"
                aria-label={`${label} — custom entries`}
                className={styles.tagList}
              >
                {customValues.map((val) => {
                  const index = value.indexOf(val);
                  return (
                    <span key={val} role="listitem">
                      <Chip label={val} size="sm" onRemove={() => removeAt(index)} />
                    </span>
                  );
                })}
              </div>
            ) : null}

            <div className={styles.ghostInputRow}>
              <Input
                id={`${id}-other`}
                label="Add your own"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onBlur={addCustom}
                helperText="Press Enter to add"
                placeholder={customPlaceholder}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export interface Step3Props {
  data: WizardStep3;
  onChange: (data: WizardStep3) => void;
}

export function Step3HealthInfo({ data, onChange }: Step3Props): ReactElement {
  const [expandedKey, setExpandedKey] = useState<SectionKey | null>(null);

  const toggle = (key: SectionKey) => (): void => {
    setExpandedKey((current) => (current === key ? null : key));
  };

  return (
    <div className={styles.root}>
      <p className={styles.disclaimer}>{PHI_DISCLAIMER}</p>
      <AccordionMultiField
        id="allergies"
        label="Allergies"
        addHint="Add any allergies"
        options={ALLERGY_OPTIONS}
        value={data.allergies}
        onChange={(allergies) => onChange({ ...data, allergies })}
        customPlaceholder="e.g., sesame"
        expanded={expandedKey === 'allergies'}
        onToggle={toggle('allergies')}
      />
      <AccordionMultiField
        id="intolerances"
        label="Food intolerances"
        addHint="Add any intolerances"
        options={INTOLERANCE_OPTIONS}
        value={data.intolerances}
        onChange={(intolerances) => onChange({ ...data, intolerances })}
        customPlaceholder="e.g., nightshades"
        expanded={expandedKey === 'intolerances'}
        onToggle={toggle('intolerances')}
      />
      <AccordionMultiField
        id="medical-conditions"
        label="Medical conditions"
        addHint="Add any conditions"
        options={CONDITION_OPTIONS}
        value={data.medical_conditions}
        onChange={(medical_conditions) => onChange({ ...data, medical_conditions })}
        customPlaceholder="e.g., IBS"
        expanded={expandedKey === 'conditions'}
        onToggle={toggle('conditions')}
      />
      <AccordionMultiField
        id="medications"
        label="Medications"
        addHint="Add any medications"
        options={MEDICATION_OPTIONS}
        value={data.medications}
        onChange={(medications) => onChange({ ...data, medications })}
        customPlaceholder="e.g., Ozempic"
        expanded={expandedKey === 'medications'}
        onToggle={toggle('medications')}
      />
    </div>
  );
}
