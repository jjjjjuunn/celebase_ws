'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from './error.module.css';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MarketingError({ error, reset }: ErrorPageProps): React.ReactElement {
  useEffect(() => {
    // TODO: forward to Sentry when observability track lands
    void error;
  }, [error]);

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Something went wrong</h2>
      <p className={styles.message}>
        We encountered an unexpected error. Please try again.
      </p>
      <div className={styles.actions}>
        <button className={styles.retryButton} type="button" onClick={reset}>
          Try again
        </button>
        <Link href="/" className={styles.homeLink}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
