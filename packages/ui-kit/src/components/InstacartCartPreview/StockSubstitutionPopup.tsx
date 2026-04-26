'use client';

import type { HTMLAttributes, ReactElement } from 'react';
import { useState } from 'react';
import { Card } from '../Card/Card.js';
import { useRovingTabIndex } from '../../hooks/useRovingTabIndex.js';
import styles from './StockSubstitutionPopup.module.css';

export interface StockSubstitutionOption {
  id: string;
  name: string;
  priceCents: number;
  note?: string;
}

export interface StockSubstitutionPopupProps extends HTMLAttributes<HTMLElement> {
  originalItem: string;
  reason?: string;
  options: StockSubstitutionOption[];
  currency?: string;
  onApprove: (optionId: string) => void;
  onReject: () => void;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function StockSubstitutionPopup(
  props: StockSubstitutionPopupProps,
): ReactElement {
  const {
    originalItem,
    reason,
    options,
    currency = 'USD',
    onApprove,
    onReject,
    className,
    ...rest
  } = props;

  const first = options[0];
  const [selectedId, setSelectedId] = useState<string>(first ? first.id : '');

  const rovingOptions = options.map((opt) => ({ value: opt.id, disabled: false }));

  const { activeIndex, itemProps, onKeyDown } = useRovingTabIndex<string>({
    options: rovingOptions,
    value: selectedId,
    onChange: (val) => {
      setSelectedId(val);
    },
    orientation: 'vertical',
  });

  const classes = [styles.popup, className].filter(Boolean).join(' ');

  return (
    <Card
      {...rest}
      variant="standard"
      className={classes}
      role="dialog"
      aria-labelledby="substitution-title"
    >
      <header className={styles.header}>
        <h3 id="substitution-title" className={styles.title}>
          Out of stock — AI suggests a swap
        </h3>
        <p className={styles.subtitle}>
          <span className={styles.struck}>{originalItem}</span>
          {reason ? <span className={styles.reason}> — {reason}</span> : null}
        </p>
      </header>

      <div
        className={styles.list}
        role="radiogroup"
        aria-label="Substitution options"
        onKeyDown={onKeyDown}
      >
        {options.map((opt, idx) => {
          const selected = opt.id === selectedId;
          const props = itemProps(idx);
          const optionClass = [styles.option, selected ? styles.optionSelected : undefined]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={opt.id}
              role="radio"
              aria-checked={selected ? 'true' : 'false'}
              tabIndex={props.tabIndex}
              ref={(el) => {
                props.ref(el);
              }}
              className={optionClass}
              onClick={() => {
                setSelectedId(opt.id);
              }}
              data-active={activeIndex === idx}
            >
              <div className={styles.optionBody}>
                <span className={styles.optionName}>{opt.name}</span>
                {opt.note ? (
                  <span className={styles.optionNote}>{opt.note}</span>
                ) : null}
              </div>
              <span className={styles.optionPrice}>
                {formatMoney(opt.priceCents, currency)}
              </span>
            </div>
          );
        })}
      </div>

      <footer className={styles.actions}>
        <button
          type="button"
          className={styles.reject}
          onClick={() => {
            onReject();
          }}
        >
          Skip item
        </button>
        <button
          type="button"
          className={styles.approve}
          onClick={() => {
            if (selectedId !== '') onApprove(selectedId);
          }}
          disabled={selectedId === ''}
        >
          Approve swap
        </button>
      </footer>
    </Card>
  );
}
