'use client';

import { forwardRef } from 'react';
import type { ForwardedRef, KeyboardEvent, ReactElement } from 'react';
import styles from './SlotChip.module.css';

export interface SlotChipProps {
  value: string;
  timeLabel: string;
  priceLabel: string;
  isFreeBadge?: boolean;
  disabled?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  tabIndex?: number;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  className?: string;
}

function SlotChipInner(
  props: SlotChipProps,
  ref: ForwardedRef<HTMLButtonElement>,
): ReactElement {
  const {
    timeLabel,
    priceLabel,
    isFreeBadge = false,
    disabled = false,
    selected = false,
    onSelect,
    tabIndex,
    onKeyDown,
    className,
  } = props;

  const classes = [
    styles.chip,
    selected ? styles.selected : null,
    disabled ? styles.disabled : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const fullText = disabled ? ', full' : '';
  const freeText = isFreeBadge ? ', free' : '';
  const ariaLabel = `${timeLabel}, ${priceLabel}${freeText}${fullText}`;

  const handleClick = (): void => {
    if (disabled) return;
    onSelect?.();
  };

  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected ? 'true' : 'false'}
      aria-disabled={disabled ? 'true' : undefined}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      onClick={handleClick}
      onKeyDown={onKeyDown}
      className={classes}
    >
      <span className={styles.time} aria-hidden="true">
        {timeLabel}
      </span>
      <span className={styles.priceRow} aria-hidden="true">
        <span className={styles.price}>{priceLabel}</span>
        {isFreeBadge ? <span className={styles.freeBadge}>Free</span> : null}
      </span>
    </button>
  );
}

export const SlotChip = forwardRef<HTMLButtonElement, SlotChipProps>(SlotChipInner);
SlotChip.displayName = 'SlotChip';
