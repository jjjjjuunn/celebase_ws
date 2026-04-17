import type { InputHTMLAttributes, ReactElement } from 'react';
import styles from './Input.module.css';

export type InputState = 'default' | 'error' | 'disabled';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'required'> {
  id: string;
  label: string;
  helperText?: string;
  errorText?: string;
  state?: InputState;
  required?: boolean;
}

export function Input(props: InputProps): ReactElement {
  const {
    id,
    label,
    helperText,
    errorText,
    state = 'default',
    required = false,
    className,
    ...rest
  } = props;

  const hasError = state === 'error' || Boolean(errorText);
  const isDisabled = state === 'disabled' || rest.disabled === true;

  const describedByIds: string[] = [];
  if (hasError && errorText) describedByIds.push(`${id}-error`);
  else if (helperText) describedByIds.push(`${id}-helper`);

  const inputClasses = [
    styles.input,
    hasError ? styles.inputError : null,
    isDisabled ? styles.inputDisabled : null,
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
        aria-required={required || undefined}
        aria-invalid={hasError || undefined}
        aria-describedby={describedByIds.length > 0 ? describedByIds.join(' ') : undefined}
        disabled={isDisabled}
        className={inputClasses}
      />
      {hasError && errorText ? (
        <span id={`${id}-error`} className={styles.errorText} role="alert">
          {errorText}
        </span>
      ) : helperText ? (
        <span id={`${id}-helper`} className={styles.helperText}>
          {helperText}
        </span>
      ) : null}
    </div>
  );
}
