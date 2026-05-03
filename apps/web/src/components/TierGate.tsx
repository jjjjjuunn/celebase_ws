'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useUser } from '@/lib/user-context.js';
import styles from './TierGate.module.css';

type RequiredTier = 'premium' | 'elite';

const TIER_RANK: Record<string, number> = {
  free: 0,
  premium: 1,
  elite: 2,
};

const TIER_LABELS: Record<RequiredTier, string> = {
  premium: 'Premium',
  elite: 'Elite',
};

interface TierGateProps {
  requiredTier: RequiredTier;
  children: ReactNode;
  fallback?: ReactNode;
}

export function TierGate({ requiredTier, children, fallback }: TierGateProps): React.ReactElement {
  const { user, loading } = useUser();

  if (loading) {
    return (
      <div className={styles.overlay} aria-busy="true">
        <span className={styles.description}>Loading…</span>
      </div>
    );
  }

  const currentRank = TIER_RANK[user?.subscription_tier ?? 'free'] ?? 0;
  const requiredRank = TIER_RANK[requiredTier] ?? 1;

  if (currentRank >= requiredRank) {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  return (
    <div className={styles.overlay} role="region" aria-label={`${TIER_LABELS[requiredTier]} feature`}>
      <span className={styles.lockIcon} aria-hidden="true">🔒</span>
      <h3 className={styles.heading}>{TIER_LABELS[requiredTier]} feature</h3>
      <p className={styles.description}>
        Upgrade to {TIER_LABELS[requiredTier]} to unlock this feature.
      </p>
      <Link href="/account" className={styles.upgradeBtn}>
        Upgrade plan
      </Link>
    </div>
  );
}
