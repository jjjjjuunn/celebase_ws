'use client';

import type { ReactElement } from 'react';
import { useRovingTabIndex } from '../../hooks/useRovingTabIndex.js';
import styles from './CategoryTabs.module.css';

export interface CategoryTabOption {
  value: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface CategoryTabsProps {
  id: string;
  options: ReadonlyArray<CategoryTabOption>;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

export function CategoryTabs({
  id,
  options,
  value,
  onChange,
  ariaLabel = 'Filter categories',
}: CategoryTabsProps): ReactElement {
  const rovingOptions = options.map((opt) => ({
    value: opt.value,
    disabled: opt.disabled === true,
  }));

  const { itemProps, onKeyDown, allDisabled } = useRovingTabIndex({
    options: rovingOptions,
    value,
    onChange,
    orientation: 'horizontal',
  });

  return (
    <div
      id={id}
      role="tablist"
      aria-label={ariaLabel}
      aria-disabled={allDisabled || undefined}
      onKeyDown={onKeyDown}
      className={styles.tablist}
    >
      {options.map((opt, idx) => {
        const isSelected = value === opt.value;
        const isDisabled = opt.disabled === true;
        const { tabIndex, ref } = itemProps(idx);

        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isSelected ? 'true' : 'false'}
            aria-disabled={isDisabled || undefined}
            tabIndex={tabIndex}
            ref={ref}
            onClick={() => {
              if (!isDisabled && !isSelected) onChange(opt.value);
            }}
            className={[styles.tab, isSelected ? styles.tabSelected : null]
              .filter(Boolean)
              .join(' ')}
          >
            <span className={styles.tabLabel}>{opt.label}</span>
            {opt.count !== undefined ? (
              <span className={styles.count} aria-label={`${String(opt.count)} items`}>
                {opt.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
