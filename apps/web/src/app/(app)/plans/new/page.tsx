'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { WsStatusBanner } from '@celebbase/ui-kit';
import { useMealPlanStream, type MealPlanStreamStatus } from '../../../../lib/useMealPlanStream.js';
import { postJson } from '../../../../lib/fetcher.js';
import { schemas } from '@celebbase/shared-types';
import styles from './plans-new.module.css';

const MIN_DAYS = 1;
const MAX_DAYS = 7;
const DEFAULT_DAYS = 3;

function PlansNewContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const router = useRouter();

  const baseDietId = searchParams.get('diet');
  const celebrity = searchParams.get('celebrity');

  const [duration, setDuration] = useState<number>(DEFAULT_DAYS);
  const [generationStarted, setGenerationStarted] = useState(false);
  const [mealPlanId, setMealPlanId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const didPost = useRef(false);

  const startGeneration = (): void => {
    if (!baseDietId || didPost.current) return;
    didPost.current = true;
    setGenerationStarted(true);
    setIsPosting(true);

    postJson<schemas.GenerateMealPlanResponse>(
      '/api/meal-plans',
      { base_diet_id: baseDietId, duration_days: duration },
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
  };

  const streamState = useMealPlanStream(mealPlanId);

  useEffect(() => {
    if (streamState.completedMealPlanId !== null) {
      router.replace(`/plans/${streamState.completedMealPlanId}/preview`);
    }
  }, [streamState.completedMealPlanId, router]);

  const handleRetry = (): void => {
    didPost.current = false;
    setInitError(null);
    setMealPlanId(null);
    setIsPosting(false);
    setGenerationStarted(false);
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

  if (!generationStarted) {
    const heading = celebrity !== null
      ? `Plan your ${decodeURIComponent(celebrity)} meal plan`
      : 'Plan your meal plan';

    const fillPct = ((duration - MIN_DAYS) / (MAX_DAYS - MIN_DAYS)) * 100;

    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>{heading}</h1>
        <p className={styles.hint}>How many days would you like to plan?</p>

        <div className={styles.durationCard}>
          <div className={styles.durationValue}>
            <span className={styles.durationNumber}>{duration}</span>
            <span className={styles.durationUnit}>{duration === 1 ? 'day' : 'days'}</span>
          </div>

          <div className={styles.sliderWrap}>
            <div className={styles.sliderTrack} aria-hidden="true">
              <div className={styles.sliderFill} style={{ width: `${String(fillPct)}%` }} />
            </div>
            <input
              type="range"
              min={MIN_DAYS}
              max={MAX_DAYS}
              step={1}
              value={duration}
              onChange={(e) => { setDuration(Number(e.target.value)); }}
              className={styles.sliderInput}
              aria-label="Plan duration in days"
              aria-valuemin={MIN_DAYS}
              aria-valuemax={MAX_DAYS}
              aria-valuenow={duration}
              aria-valuetext={`${String(duration)} ${duration === 1 ? 'day' : 'days'}`}
            />
          </div>

          <div className={styles.sliderTicks} aria-hidden="true">
            <span>1d</span>
            <span>1 week</span>
          </div>
        </div>

        <button
          type="button"
          className={styles.generateBtn}
          onClick={startGeneration}
        >
          Generate plan
        </button>
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
