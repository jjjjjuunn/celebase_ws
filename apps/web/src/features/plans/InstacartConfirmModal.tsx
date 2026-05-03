'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './instacart-confirm.module.css';

export interface InstacartCartSummary {
  cart_id: string;
  cart_url: string;
  item_count: number;
  mode: 'mock' | 'live';
}

export interface InstacartItem {
  name: string;
  quantity: number;
  unit: string;
}

interface Props {
  open: boolean;
  summary: InstacartCartSummary | null;
  items: InstacartItem[];
  skippedCount: number;
  onClose: () => void;
  onContinue: () => void;
}

// Plan 22 · Phase F — Confirmation modal shown after the Plan Preview
// "Sync to Instacart" button succeeds. Surfaces the mock cart URL (preview badge),
// the final ingredient list, and a primary CTA that kicks off the plan-confirm
// PATCH in the parent client.
export function InstacartConfirmModal({
  open,
  summary,
  items,
  skippedCount,
  onClose,
  onContinue,
}: Props): React.ReactElement | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open || summary === null) return null;

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(summary.cart_url).then(
      () => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      },
      () => {
        // clipboard blocked — fall back to the visible link below; no fatal UX.
      },
    );
  };

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="instacart-confirm-title"
        tabIndex={-1}
        className={styles.dialog}
      >
        <header className={styles.header}>
          <div className={styles.titleRow}>
            <h2 id="instacart-confirm-title" className={styles.title}>
              Your cart is ready
            </h2>
            {summary.mode === 'mock' && (
              <span className={styles.previewBadge}>Preview</span>
            )}
          </div>
          <p className={styles.subtitle}>
            {String(summary.item_count)} item{summary.item_count === 1 ? '' : 's'} queued
            {skippedCount > 0
              ? ` · ${String(skippedCount)} meal${skippedCount === 1 ? '' : 's'} skipped`
              : ''}
            .
          </p>
        </header>

        <div className={styles.urlRow}>
          <code className={styles.url}>{summary.cart_url}</code>
          <button type="button" className={styles.copyBtn} onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <details className={styles.itemsDetails}>
          <summary className={styles.itemsSummary}>
            View ingredient list
          </summary>
          <ul className={styles.itemsList}>
            {items.map((it) => (
              <li key={`${it.name}:${it.unit}`} className={styles.itemRow}>
                <span className={styles.itemName}>{it.name}</span>
                <span className={styles.itemQty}>
                  {it.quantity % 1 === 0 ? String(it.quantity) : it.quantity.toFixed(2)}
                  {' '}{it.unit}
                </span>
              </li>
            ))}
          </ul>
        </details>

        <footer className={styles.footer}>
          <a
            href={summary.cart_url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.ghostCta}
          >
            Open Instacart
          </a>
          <button
            type="button"
            className={styles.primaryCta}
            onClick={onContinue}
          >
            Lock in &amp; go home
          </button>
        </footer>
      </div>
    </div>
  );
}
