'use client';

import type { ReactElement } from 'react';
import { Input, SegmentedControl } from '@celebbase/ui-kit';
import type { SegmentedControlOption } from '@celebbase/ui-kit';
import type { WizardStep1 } from '../wizard-schema.js';
import { DateOfBirthPicker } from './DateOfBirthPicker.js';
import styles from './steps.module.css';

type SexValue = NonNullable<WizardStep1['sex']>;

const SEX_OPTIONS: ReadonlyArray<SegmentedControlOption<SexValue>> = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const DOB_MIN_YEAR = 1920;
const DOB_MAX_YEAR = 2013;
const DOB_DEFAULT_YEAR = 1995;
const DOB_DEFAULT_MONTH = 6;
const DOB_DEFAULT_DAY = 15;

function displayNameHelper(name: string | undefined): string {
  const trimmed = (name ?? '').trim();
  if (trimmed.length === 0) return 'What should we call you?';
  const firstWord = trimmed.split(/\s+/)[0] ?? trimmed;
  return `Nice to meet you, ${firstWord}.`;
}

function birthDateHelper(
  year: number | undefined,
  month: number | undefined,
  day: number | undefined,
): string | undefined {
  if (year === undefined) return undefined;
  const thisYear = new Date().getFullYear();
  const age = thisYear - year;
  if (age < 13 || age > 110) return undefined;
  const hasFullDate = month !== undefined && day !== undefined;
  const suffix = hasFullDate ? ' We\u2019ll remember your day.' : '';
  if (age < 30) return `${String(age)} \u2014 a great decade to build habits that stick.${suffix}`;
  if (age < 45) return `${String(age)} \u2014 your prime window for metabolic change.${suffix}`;
  if (age < 60) return `${String(age)} \u2014 small choices now compound for decades.${suffix}`;
  return `${String(age)} \u2014 we\u2019re here to help you feel sharp and strong.${suffix}`;
}

function sexHelper(sex: WizardStep1['sex'] | undefined): string | undefined {
  if (sex === undefined) return undefined;
  return 'Got it. This helps us calibrate your macro and calorie targets.';
}

export interface Step1Props {
  data: Partial<WizardStep1>;
  onChange: (data: Partial<WizardStep1>) => void;
}

export function Step1BasicInfo({ data, onChange }: Step1Props): ReactElement {
  const sexHelperText = sexHelper(data.sex);
  const birthHelperText = birthDateHelper(data.birth_year, data.birth_month, data.birth_day);
  return (
    <div className={styles.rootSpaced}>
      <section className={styles.fieldSection}>
        <Input
          id="display-name"
          label="Display name"
          required
          value={data.display_name ?? ''}
          maxLength={100}
          onChange={(e) => onChange({ ...data, display_name: e.target.value })}
          helperText={displayNameHelper(data.display_name)}
        />
      </section>
      <section className={styles.fieldSection}>
        <DateOfBirthPicker
          id="birth-date"
          label="Date of birth"
          required
          minYear={DOB_MIN_YEAR}
          maxYear={DOB_MAX_YEAR}
          defaultYear={DOB_DEFAULT_YEAR}
          defaultMonth={DOB_DEFAULT_MONTH}
          defaultDay={DOB_DEFAULT_DAY}
          year={data.birth_year}
          month={data.birth_month}
          day={data.birth_day}
          onChange={(next) => {
            const merged: Partial<WizardStep1> = { ...data };
            if (next.year !== undefined) merged.birth_year = next.year;
            if (next.month !== undefined) merged.birth_month = next.month;
            if (next.day !== undefined) merged.birth_day = next.day;
            onChange(merged);
          }}
          {...(birthHelperText !== undefined ? { helperText: birthHelperText } : {})}
        />
      </section>
      <section className={styles.fieldSection}>
        <div className={styles.segmentField}>
          <span className={styles.segmentLabel} id="sex-label">
            Biological Sex
            <span aria-hidden="true" className={styles.requiredMark}>
              *
            </span>
          </span>
          <SegmentedControl<SexValue>
            id="sex"
            ariaLabel="Biological Sex"
            options={SEX_OPTIONS}
            value={(data.sex ?? '') as SexValue}
            onChange={(val) => onChange({ ...data, sex: val })}
            className={styles.segmentFullWidth}
          />
          {sexHelperText !== undefined ? (
            <span className={styles.segmentHelper} id="sex-helper">
              {sexHelperText}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
