import type { SelectHTMLAttributes, ReactElement } from 'react';
import styles from './SelectField.module.css';

export interface SelectFieldOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps
  extends Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    'id' | 'required' | 'children' | 'onChange' | 'value'
  > {
  id: string;
  label: string;
  options: ReadonlyArray<SelectFieldOption>;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function SelectField(props: SelectFieldProps): ReactElement {
  const {
    id,
    label,
    options,
    value,
    onChange,
    error,
    helperText,
    required = false,
    disabled = false,
    placeholder,
    className,
    ...rest
  } = props;

  const hasError = Boolean(error);

  const describedByIds: string[] = [];
  if (hasError) describedByIds.push(`${id}-error`);
  if (helperText) describedByIds.push(`${id}-helper`);

  const selectClasses = [styles.select, hasError ? styles.selectError : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required ? (
          <span className={styles.requiredMark} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <div className={styles.selectWrapper}>
        <select
          {...rest}
          id={id}
          value={value}
          required={required}
          aria-required={required || undefined}
          aria-invalid={hasError || undefined}
          aria-describedby={
            describedByIds.length > 0 ? describedByIds.join(' ') : undefined
          }
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className={selectClasses}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <svg
          className={styles.chevron}
          aria-hidden="true"
          viewBox="0 0 20 20"
          width="20"
          height="20"
        >
          <path
            d="M5 7l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {hasError ? (
        <span
          id={`${id}-error`}
          className={styles.errorText}
          role="alert"
          aria-live="polite"
        >
          {error}
        </span>
      ) : null}
      {helperText ? (
        <span id={`${id}-helper`} className={styles.helperText}>
          {helperText}
        </span>
      ) : null}
    </div>
  );
}
