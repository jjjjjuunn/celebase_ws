import type { InputHTMLAttributes, ReactElement } from 'react';
import styles from './InputField.module.css';

export interface InputFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'required'> {
  id: string;
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  align?: 'left' | 'right';
}

export function InputField(props: InputFieldProps): ReactElement {
  const {
    id,
    label,
    error,
    helperText,
    required = false,
    disabled = false,
    align = 'left',
    className,
    ...rest
  } = props;

  const hasError = Boolean(error && error.length > 0);

  const describedByIds: string[] = [];
  if (hasError) describedByIds.push(`${id}-error`);
  if (helperText) describedByIds.push(`${id}-helper`);

  const inputClasses = [
    styles.input,
    hasError ? styles.inputError : null,
    align === 'right' ? styles.alignRight : null,
    className,
  ]
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
      <input
        {...rest}
        id={id}
        required={required}
        aria-required={required ? true : undefined}
        aria-invalid={hasError ? true : undefined}
        aria-describedby={describedByIds.length > 0 ? describedByIds.join(' ') : undefined}
        disabled={disabled}
        className={inputClasses}
      />
      {hasError ? (
        <span id={`${id}-error`} className={styles.errorText} role="alert" aria-live="polite">
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
