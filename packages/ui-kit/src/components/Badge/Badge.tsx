import type { HTMLAttributes, MouseEvent, ReactElement, ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  variant?: BadgeVariant;
  dot?: boolean;
  selected?: boolean;
  onRemove?: () => void;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: styles.variantNeutral ?? '',
  brand: styles.variantBrand ?? '',
  success: styles.variantSuccess ?? '',
  warning: styles.variantWarning ?? '',
  danger: styles.variantDanger ?? '',
  info: styles.variantInfo ?? '',
};

export function Badge(props: BadgeProps): ReactElement {
  const {
    variant = 'neutral',
    dot = false,
    selected = false,
    onRemove,
    className,
    children,
    ...rest
  } = props;

  const classes = [
    styles.badge,
    VARIANT_CLASS[variant],
    selected ? styles.selected : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleRemoveClick = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    onRemove?.();
  };

  return (
    <span {...rest} className={classes} aria-pressed={selected ? true : undefined}>
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      <span className={styles.label}>{children}</span>
      {onRemove ? (
        <button
          type="button"
          className={styles.removeButton}
          onClick={handleRemoveClick}
          aria-label="Remove"
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </span>
  );
}
