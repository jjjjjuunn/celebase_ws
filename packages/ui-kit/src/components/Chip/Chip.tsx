'use client';

import type { MouseEvent, ReactElement, ReactNode } from 'react';
import styles from './Chip.module.css';

export type ChipSize = 'sm' | 'md';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onToggle?: () => void;
  onRemove?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  size?: ChipSize;
  className?: string;
}

export function Chip(props: ChipProps): ReactElement {
  const {
    label,
    selected,
    onToggle,
    onRemove,
    icon,
    disabled = false,
    size = 'md',
    className,
  } = props;

  const isToggle = selected !== undefined;
  const isSelected = selected === true;

  const rootClasses = [
    styles.chip,
    size === 'sm' ? styles.sizeSm : styles.sizeMd,
    isSelected ? styles.selected : null,
    disabled ? styles.disabled : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = (): void => {
    if (disabled) return;
    onToggle?.();
  };

  const handleRemoveClick = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    if (disabled) return;
    onRemove?.();
  };

  const commonProps = {
    className: rootClasses,
    'aria-disabled': disabled ? ('true' as const) : undefined,
  };

  const body = (
    <>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={styles.label}>{label}</span>
      {onRemove ? (
        <button
          type="button"
          className={styles.removeButton}
          onClick={handleRemoveClick}
          aria-label={`Remove ${label}`}
          disabled={disabled}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </>
  );

  if (isToggle || onToggle !== undefined) {
    return (
      <button
        {...commonProps}
        type="button"
        role="button"
        aria-pressed={isToggle ? (isSelected ? 'true' : 'false') : undefined}
        disabled={disabled}
        onClick={handleClick}
      >
        {body}
      </button>
    );
  }

  return <span {...commonProps}>{body}</span>;
}
