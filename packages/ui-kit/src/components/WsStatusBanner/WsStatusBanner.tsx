'use client';

import type { ReactElement } from 'react';
import styles from './WsStatusBanner.module.css';

export type WsStreamStatus = 'idle' | 'connecting' | 'streaming' | 'success' | 'error';

export interface WsStatusBannerProps {
  status: WsStreamStatus;
  progressPct?: number;
  message?: string;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export function WsStatusBanner({
  status,
  progressPct = 0,
  message = '',
  error = null,
  onRetry,
  className,
}: WsStatusBannerProps): ReactElement | null {
  if (status === 'idle' || status === 'success') return null;

  const classes = [styles.root, styles[status], className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="status" aria-live="polite" aria-atomic="true">
      {status === 'connecting' && (
        <div className={styles.row}>
          <span className={styles.spinner} aria-hidden="true" />
          <span>Connecting…</span>
        </div>
      )}

      {status === 'streaming' && (
        <div className={styles.streamingBody}>
          <div className={styles.row}>
            <span className={styles.spinner} aria-hidden="true" />
            <span>{message !== '' ? message : 'Generating your meal plan…'}</span>
            <span className={styles.pct}>{progressPct}%</span>
          </div>
          <div
            className={styles.track}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={styles.fill} style={{ width: `${String(progressPct)}%` }} />
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className={styles.row}>
          <span className={styles.errorIcon} aria-hidden="true">⚠</span>
          <span className={styles.errorText}>{error ?? 'Something went wrong'}</span>
          {onRetry !== undefined && (
            <button type="button" className={styles.retryBtn} onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
