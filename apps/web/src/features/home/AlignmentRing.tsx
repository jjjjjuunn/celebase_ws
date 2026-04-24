'use client';

import type { ReactElement } from 'react';
import styles from './AlignmentRing.module.css';

export interface AlignmentRingProps {
  value: number | null;
  loading?: boolean;
  personaDisplayName: string | null;
  size?: 'md' | 'lg';
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

export function AlignmentRing(props: AlignmentRingProps): ReactElement {
  const { value, loading = false, personaDisplayName, size = 'md' } = props;

  const pct = value !== null ? clamp(value) : 0;
  const hasValue = value !== null && !loading;

  const label =
    hasValue && personaDisplayName !== null
      ? `Blueprint alignment with ${personaDisplayName}: ${String(pct)} percent`
      : hasValue
        ? `Blueprint alignment: ${String(pct)} percent`
        : 'Blueprint alignment pending';

  const rootClass = [styles.root, size === 'lg' ? styles.lg : styles.md]
    .filter(Boolean)
    .join(' ');

  if (!hasValue) {
    return (
      <div className={rootClass} aria-busy="true" aria-label={label}>
        <div className={styles.ringTrack} aria-hidden="true" />
        <span className={styles.value} aria-hidden="true">—</span>
      </div>
    );
  }

  return (
    <div
      className={rootClass}
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{ '--cb-ring-progress': `${String(pct * 3.6)}deg` } as React.CSSProperties}
    >
      <div className={styles.ringFill} aria-hidden="true" />
      <div className={styles.ringTrack} aria-hidden="true" />
      <span className={styles.value}>
        {String(pct)}
        <span className={styles.unit}>%</span>
      </span>
    </div>
  );
}
