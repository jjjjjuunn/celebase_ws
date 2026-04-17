import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: styles.variantPrimary ?? '',
  secondary: styles.variantSecondary ?? '',
  ghost: styles.variantGhost ?? '',
  destructive: styles.variantDestructive ?? '',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: styles.sizeSm ?? '',
  md: styles.sizeMd ?? '',
};

export function Button(props: ButtonProps): ReactElement {
  const {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    type = 'button',
    className,
    children,
    ...rest
  } = props;

  const isDisabled = disabled || loading;

  const classes = [
    styles.button,
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    loading ? styles.loading : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      <span className={styles.label}>{children}</span>
    </button>
  );
}
