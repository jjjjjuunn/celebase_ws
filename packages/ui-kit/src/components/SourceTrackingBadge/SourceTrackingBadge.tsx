import type { AnchorHTMLAttributes, ReactElement } from 'react';
import styles from './SourceTrackingBadge.module.css';

export interface SourceTrackingBadgeProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> {
  sourceLabel: string;
  href: string;
  verifiedAt?: string;
}

export function SourceTrackingBadge(props: SourceTrackingBadgeProps): ReactElement {
  const { sourceLabel, href, verifiedAt, className, ...rest } = props;

  const classes = [styles.badge, className].filter(Boolean).join(' ');

  return (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={classes}
      aria-label={`Source: ${sourceLabel}${verifiedAt ? ` (verified ${verifiedAt})` : ''} — opens in new tab`}
    >
      <span className={styles.label}>{sourceLabel}</span>
      {verifiedAt ? (
        <span className={styles.verified} aria-hidden="true">
          · {verifiedAt}
        </span>
      ) : null}
      <svg
        className={styles.externalIcon}
        aria-hidden="true"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
      >
        <path
          d="M3 1h6v6M9 1L4 6M4 1H1v8h8V6"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}
