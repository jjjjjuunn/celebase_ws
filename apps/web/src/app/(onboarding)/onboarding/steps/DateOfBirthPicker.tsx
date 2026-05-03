'use client';

import { useEffect, useMemo, type ReactElement } from 'react';
import { DrumPicker } from './DrumPicker.js';
import styles from './DateOfBirthPicker.module.css';

const MONTH_SHORT: ReadonlyArray<string> = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function formatDisplay(year: number | undefined, month: number | undefined, day: number | undefined): string {
  if (year === undefined || month === undefined || day === undefined) return '— — —';
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${String(year)} · ${mm} · ${dd}`;
}

export interface DateOfBirthPickerProps {
  id: string;
  label: string;
  minYear: number;
  maxYear: number;
  defaultYear: number;
  defaultMonth: number;
  defaultDay: number;
  year: number | undefined;
  month: number | undefined;
  day: number | undefined;
  onChange: (next: { year?: number; month?: number; day?: number }) => void;
  required?: boolean;
  helperText?: string;
}

export function DateOfBirthPicker(props: DateOfBirthPickerProps): ReactElement {
  const {
    id,
    label,
    minYear,
    maxYear,
    defaultYear,
    defaultMonth,
    defaultDay,
    year,
    month,
    day,
    onChange,
    required = false,
    helperText,
  } = props;

  const resolvedYear = year ?? defaultYear;
  const resolvedMonth = month ?? defaultMonth;

  const maxDay = useMemo(() => daysInMonth(resolvedYear, resolvedMonth), [resolvedYear, resolvedMonth]);

  useEffect(() => {
    if (day !== undefined && day > maxDay) {
      onChange({ day: maxDay });
    }
  }, [day, maxDay, onChange]);

  const display = formatDisplay(year, month, day);
  const isEmpty = year === undefined || month === undefined || day === undefined;

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={`${id}-year`} className={styles.label}>
          {label}
          {required ? (
            <span aria-hidden="true" className={styles.requiredMark}>
              *
            </span>
          ) : null}
        </label>
        <span className={styles.valueDisplay} data-empty={isEmpty ? 'true' : 'false'}>
          {display}
        </span>
      </div>
      <div className={styles.columns} role="group" aria-label={label}>
        <div className={styles.column}>
          <span className={styles.columnLabel} aria-hidden="true">
            Year
          </span>
          <DrumPicker
            id={`${id}-year`}
            label="Year"
            ariaLabel="Birth year"
            unit=""
            showHeader={false}
            viewportHeight={156}
            min={minYear}
            max={maxYear}
            step={1}
            value={year}
            defaultValue={defaultYear}
            onChange={(v) => onChange({ year: v })}
            required={required}
          />
        </div>
        <div className={styles.column}>
          <span className={styles.columnLabel} aria-hidden="true">
            Month
          </span>
          <DrumPicker
            id={`${id}-month`}
            label="Month"
            ariaLabel="Birth month"
            unit=""
            showHeader={false}
            viewportHeight={156}
            min={1}
            max={12}
            step={1}
            value={month}
            defaultValue={defaultMonth}
            onChange={(v) => onChange({ month: v })}
            required={required}
            formatItem={(v) => MONTH_SHORT[v - 1] ?? String(v)}
          />
        </div>
        <div className={styles.column}>
          <span className={styles.columnLabel} aria-hidden="true">
            Day
          </span>
          <DrumPicker
            id={`${id}-day`}
            label="Day"
            ariaLabel="Birth day"
            unit=""
            showHeader={false}
            viewportHeight={156}
            min={1}
            max={maxDay}
            step={1}
            value={day}
            defaultValue={Math.min(defaultDay, maxDay)}
            onChange={(v) => onChange({ day: v })}
            required={required}
          />
        </div>
      </div>
      {helperText !== undefined ? <span className={styles.helper}>{helperText}</span> : null}
    </div>
  );
}
