'use client';

import { useRouter } from 'next/navigation';
import styles from './plan-detail.module.css';

interface ConfirmPlanProps {
  planId: string;
}

export function ConfirmPlan({ planId }: ConfirmPlanProps): React.ReactElement {
  const router = useRouter();

  const handleConfirm = (): void => {
    router.push(`/plans/${encodeURIComponent(planId)}/preview`);
  };

  return (
    <div className={styles.confirmSection}>
      <p className={styles.confirmHint}>
        Review your meals and ingredients before we sync to Instacart. Skip anything you already have.
      </p>
      <button
        type="button"
        className={styles.confirmBtn}
        onClick={handleConfirm}
      >
        Confirm Plan
      </button>
    </div>
  );
}
