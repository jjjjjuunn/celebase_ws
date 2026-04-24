'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { WsStatusBanner } from '@celebbase/ui-kit';
import { useMealPlanStream, type MealPlanStreamStatus } from '../../../../lib/useMealPlanStream.js';
import { postJson } from '../../../../lib/fetcher.js';
import { schemas } from '@celebbase/shared-types';
import styles from './plans-new.module.css';

function PlansNewContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const router = useRouter();

  const baseDietId = searchParams.get('diet');
  const celebrity = searchParams.get('celebrity');

  const [mealPlanId, setMealPlanId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const didPost = useRef(false);

  useEffect(() => {
    if (!baseDietId || didPost.current) return;
    didPost.current = true;
    setIsPosting(true);

    postJson<schemas.GenerateMealPlanResponse>(
      '/api/meal-plans',
      { base_diet_id: baseDietId, duration_days: 7 },
      { schema: schemas.GenerateMealPlanResponseSchema },
    )
      .then((data) => {
        setMealPlanId(data.id);
      })
      .catch((err: unknown) => {
        setInitError(err instanceof Error ? err.message : 'Failed to start plan generation');
      })
      .finally(() => {
        setIsPosting(false);
      });
  }, [baseDietId]);

  const streamState = useMealPlanStream(mealPlanId);

  useEffect(() => {
    if (streamState.completedMealPlanId !== null) {
      // Plan 22 Phase E — land on preview so the user can inspect + skip meals
      // before we confirm the plan and push them to Home.
      router.replace(`/plans/${streamState.completedMealPlanId}/preview`);
    }
  }, [streamState.completedMealPlanId, router]);

  const handleRetry = (): void => {
    didPost.current = false;
    setInitError(null);
    setMealPlanId(null);
    setIsPosting(false);
  };

  if (!baseDietId) {
    return (
      <div className={styles.page}>
        <p role="alert" className={styles.errorText}>
          Missing plan parameters. Please{' '}
          <Link href="/celebrities" className={styles.link}>
            choose a celebrity
          </Link>{' '}
          first.
        </p>
      </div>
    );
  }

  const wsStatus: MealPlanStreamStatus =
    initError !== null ? 'error'
    : isPosting ? 'connecting'
    : streamState.status;

  const wsError = initError ?? streamState.error;

  const showRetry = wsStatus === 'error';

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>
        {celebrity !== null
          ? `Generating your ${decodeURIComponent(celebrity)} meal plan`
          : 'Generating your meal plan'}
      </h1>

      <WsStatusBanner
        status={wsStatus}
        progressPct={streamState.progressPct}
        message={streamState.message}
        error={wsError}
        onRetry={showRetry ? handleRetry : undefined}
        className={styles.banner}
      />

      {wsStatus === 'connecting' || wsStatus === 'streaming' ? (
        <p className={styles.hint}>This usually takes 30–60 seconds. Stay on this page.</p>
      ) : null}
    </div>
  );
}

export default function PlansNewPage(): React.ReactElement {
  return <PlansNewContent />;
}
