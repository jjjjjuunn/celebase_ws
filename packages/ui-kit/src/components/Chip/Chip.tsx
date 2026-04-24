'use client';

import type { KeyboardEvent, MouseEvent, ReactElement, ReactNode } from 'react';
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

  const doRemove = (): void => { if (!disabled) onRemove?.(); };

  const handleRemoveClick = (event: MouseEvent<HTMLElement>): void => {
    event.stopPropagation();
    doRemove();
  };

  const handleRemoveKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      doRemove();
    }
  };

  const commonProps = {
    className: rootClasses,
    'aria-disabled': disabled ? ('true' as const) : undefined,
  };

  const isRootButton = isToggle || onToggle !== undefined;

  const removeEl = onRemove ? (
    isRootButton ? (
      // Cannot nest <button> inside <button> — use span with role
      <span
        role="button"
        tabIndex={disabled ? -1 : 0}
        className={styles.removeButton}
        onClick={handleRemoveClick}
        onKeyDown={handleRemoveKeyDown}
        aria-label={`Remove ${label}`}
        aria-disabled={disabled ? 'true' : undefined}
      >
        <span aria-hidden="true">×</span>
      </span>
    ) : (
      <button
        type="button"
        className={styles.removeButton}
        onClick={handleRemoveClick}
        aria-label={`Remove ${label}`}
        disabled={disabled}
      >
        <span aria-hidden="true">×</span>
      </button>
    )
  ) : null;

  const body = (
    <>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={styles.label}>{label}</span>
      {removeEl}
    </>
  );

  if (isRootButton) {
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
