'use client';

import type { ReactElement, ReactNode } from 'react';
import { useRovingTabIndex } from '../../hooks/useRovingTabIndex.js';
import styles from './SegmentedControl.module.css';

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  id: string;
  ariaLabel: string;
  options: ReadonlyArray<SegmentedControlOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string = string>(
  props: SegmentedControlProps<T>,
): ReactElement {
  const {
    id,
    ariaLabel,
    options,
    value,
    onChange,
    size = 'md',
    disabled = false,
    className,
  } = props;

  const rovingOptions = options.map((opt) => ({
    value: opt.value,
    disabled: disabled || opt.disabled === true,
  }));

  const { itemProps, onKeyDown, allDisabled } = useRovingTabIndex<T>({
    options: rovingOptions,
    value,
    onChange,
    orientation: 'horizontal',
  });

  const groupDisabled = disabled || allDisabled;

  const groupClasses = [
    styles.group,
    size === 'sm' ? styles.sizeSm : styles.sizeMd,
    groupDisabled ? styles.groupDisabled : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={groupDisabled || undefined}
      onKeyDown={onKeyDown}
      className={groupClasses}
    >
      {options.map((opt, idx) => {
        const isActive = value === opt.value;
        const isDisabled = disabled || opt.disabled === true;
        const { tabIndex, ref } = itemProps(idx);
        const segmentClasses = [styles.segment, isActive ? styles.active : null]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive ? 'true' : 'false'}
            aria-disabled={isDisabled || undefined}
            disabled={isDisabled}
            tabIndex={tabIndex}
            ref={ref}
            onClick={() => {
              if (!isDisabled && !isActive) onChange(opt.value);
            }}
            className={segmentClasses}
          >
            {opt.icon ? (
              <span className={styles.icon} aria-hidden="true">
                {opt.icon}
              </span>
            ) : null}
            <span className={styles.label}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
