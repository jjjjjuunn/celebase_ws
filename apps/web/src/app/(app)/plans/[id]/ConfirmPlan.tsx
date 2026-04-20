'use client';

import { useState } from 'react';
import { schemas } from '@celebbase/shared-types';
import { patchJson } from '../../../../lib/fetcher.js';
import styles from './plan-detail.module.css';

interface ConfirmPlanProps {
  planId: string;
  onConfirmed: () => void;
}

export function ConfirmPlan({ planId, onConfirmed }: ConfirmPlanProps): React.ReactElement {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = (): void => {
    setState('loading');
    setError(null);
    patchJson<schemas.MealPlanDetailResponse>(
      `/api/meal-plans/${planId}`,
      { status: 'active' },
      { schema: schemas.MealPlanDetailResponseSchema },
    )
      .then(() => {
        onConfirmed();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to confirm plan');
        setState('error');
      });
  };

  return (
    <div className={styles.confirmSection}>
      <p className={styles.confirmHint}>
        Confirming your plan locks it in. You can still regenerate if needed.
      </p>
      {error !== null && (
        <p role="alert" className={styles.confirmError}>
          {error}
        </p>
      )}
      <button
        type="button"
        className={styles.confirmBtn}
        onClick={handleConfirm}
        disabled={state === 'loading'}
        aria-busy={state === 'loading'}
      >
        {state === 'loading' ? 'Confirming…' : 'Confirm Plan'}
      </button>
    </div>
  );
}
