'use client';

import type { HTMLAttributes, ReactElement } from 'react';
import styles from './IdentitySyncScore.module.css';

export interface IdentitySyncScoreProps extends HTMLAttributes<HTMLElement> {
  score: number | null;
  personaDisplayName: string | null;
  status?: 'ready' | 'pending' | 'error';
}

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

export function IdentitySyncScore(props: IdentitySyncScoreProps): ReactElement {
  const {
    score,
    personaDisplayName,
    status = 'ready',
    className,
    ...rest
  } = props;

  const classes = [styles.root, className].filter(Boolean).join(' ');

  if (status === 'pending' || score === null || personaDisplayName === null) {
    return (
      <div {...rest} className={classes} aria-live="polite">
        <span className={styles.placeholder}>Calculating your Identity Sync…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div {...rest} className={classes}>
        <span className={styles.placeholder}>
          We&apos;ll refresh your sync once your persona is set.
        </span>
      </div>
    );
  }

  const clamped = clampScore(score);

  return (
    <div
      {...rest}
      className={classes}
      role="status"
      aria-label={`Identity sync with ${personaDisplayName} at ${String(clamped)} percent`}
    >
      <span className={styles.value}>
        {String(clamped)}
        <span className={styles.unit}>%</span>
      </span>
      <span className={styles.caption}>
        synced with <strong>{personaDisplayName}</strong>
      </span>
    </div>
  );
}
