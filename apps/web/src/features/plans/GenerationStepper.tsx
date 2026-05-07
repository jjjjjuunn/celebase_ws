'use client';

import { useEffect, useState, type ReactElement } from 'react';
import type { schemas } from '@celebbase/shared-types';
import type { MealPlanStreamStatus } from '../../lib/useMealPlanStream.js';
import styles from './GenerationStepper.module.css';

const FALLBACK_DISHES: readonly string[] = [
  'Grilled chicken bowl',
  'Salmon poke',
  'Avocado toast',
  'Greek yogurt parfait',
  'Quinoa salad',
  'Tofu stir-fry',
  'Sweet potato hash',
  'Egg white omelet',
  'Turkey lettuce wraps',
  'Lentil soup',
];

const DISH_EMOJIS: readonly string[] = [
  '🥗', '🥑', '🥦', '🍳', '🍣', '🍱', '🍲', '🥘', '🥕', '🍅',
  '🍠', '🥬', '🍇', '🍎', '🫐', '🥒', '🌽', '🥚',
];

const REASSURANCE_LINES: readonly string[] = [
  'Cross-checking allergens…',
  'Balancing protein, carbs, and fat…',
  'Matching your daily calorie target…',
  'Scanning for micronutrient gaps…',
  'Avoiding repeats across the week…',
  'Aligning with your activity level…',
  'Citing trusted sources…',
  'Rounding portions to realistic sizes…',
  'Filtering by your dietary preferences…',
  'Optimizing variety across meals…',
];

function pickRandom<T>(pool: readonly T[], exclude?: T): T {
  if (pool.length <= 1) return pool[0]!;
  let next = pool[Math.floor(Math.random() * pool.length)]!;
  if (exclude !== undefined) {
    let guard = 0;
    while (next === exclude && guard < 5) {
      next = pool[Math.floor(Math.random() * pool.length)]!;
      guard += 1;
    }
  }
  return next;
}

interface ThinkingTickerProps {
  candidates: readonly string[];
}

function ThinkingTicker({ candidates }: ThinkingTickerProps): ReactElement {
  const dishPool = candidates.length > 0 ? candidates : FALLBACK_DISHES;
  const initialDish = dishPool[0] ?? '';
  const initialEmoji = DISH_EMOJIS[0] ?? '';
  const [text, setText] = useState<string>(`${initialDish} ${initialEmoji}`);

  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    let lastDish: string | undefined;
    let lastReassurance: string | undefined;
    let showReassurance = false;
    const interval = window.setInterval(() => {
      if (showReassurance) {
        const next = pickRandom(REASSURANCE_LINES, lastReassurance);
        lastReassurance = next;
        setText(next);
      } else {
        const dish = pickRandom(dishPool, lastDish);
        const emoji = pickRandom(DISH_EMOJIS);
        lastDish = dish;
        setText(`${dish} ${emoji}`);
      }
      showReassurance = !showReassurance;
    }, 1600);
    return () => {
      window.clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dishPool.length > 0 ? dishPool[0] : '']);

  return (
    <p className={styles.thinking} aria-hidden="true">
      <span key={text} className={styles.thinkingItem}>
        {text}
      </span>
    </p>
  );
}

export interface GenerationStepperProps {
  status: MealPlanStreamStatus;
  stage: schemas.WsPlanProgressStage | null;
  detail: string | null;
  candidateRecipes: readonly string[];
  llmMode: boolean;
  celebrityName: string | null;
  error: string | null;
  onRetry?: () => void;
}

type RowKey = schemas.WsPlanProgressStage;
type RowState = 'done' | 'active' | 'pending';

interface Row {
  key: RowKey;
  label: string;
  detail: string | null;
  state: RowState;
}

const STAGE_ORDER: readonly RowKey[] = [
  'analyzing_profile',
  'selecting_recipes',
  'verifying_nutrition',
  'personalizing',
];

function rowLabel(key: RowKey, celebrityName: string | null): string {
  switch (key) {
    case 'analyzing_profile':
      return 'Analyzing your profile';
    case 'selecting_recipes':
      return 'Selecting recipes';
    case 'verifying_nutrition':
      return 'Verifying nutrition';
    case 'personalizing':
      return celebrityName !== null && celebrityName !== ''
        ? `Personalizing with ${celebrityName}`
        : 'Personalizing';
  }
}

function computeRows(
  status: MealPlanStreamStatus,
  stage: RowKey | null,
  detail: string | null,
  llmMode: boolean,
  celebrityName: string | null,
): Row[] {
  const visibleKeys = llmMode ? STAGE_ORDER : STAGE_ORDER.filter((k) => k !== 'personalizing');

  if (status === 'success') {
    return visibleKeys.map((key) => ({
      key,
      label: rowLabel(key, celebrityName),
      detail: null,
      state: 'done',
    }));
  }

  const activeIdx = stage !== null ? visibleKeys.indexOf(stage) : -1;

  return visibleKeys.map((key, idx) => {
    let state: RowState;
    if (activeIdx === -1) {
      state = idx === 0 ? 'active' : 'pending';
    } else if (idx < activeIdx) {
      state = 'done';
    } else if (idx === activeIdx) {
      state = 'active';
    } else {
      state = 'pending';
    }
    return {
      key,
      label: rowLabel(key, celebrityName),
      detail: state === 'active' ? detail : null,
      state,
    };
  });
}

function Indicator({ state }: { state: RowState }): ReactElement {
  if (state === 'done') {
    return (
      <span className={`${styles.indicator} ${styles.indicatorDone}`} aria-hidden="true">
        <span className={styles.checkmark}>✓</span>
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className={`${styles.indicator} ${styles.indicatorActive}`} aria-hidden="true">
        <span className={styles.spinner} />
      </span>
    );
  }
  return <span className={`${styles.indicator} ${styles.indicatorPending}`} aria-hidden="true" />;
}

export function GenerationStepper({
  status,
  stage,
  detail,
  candidateRecipes,
  llmMode,
  celebrityName,
  error,
  onRetry,
}: GenerationStepperProps): ReactElement | null {
  if (status === 'idle') return null;

  if (status === 'error') {
    return (
      <div className={styles.root} role="alert">
        <div className={styles.errorRow}>
          <span className={styles.errorIcon} aria-hidden="true">
            ⚠
          </span>
          <span>{error ?? 'Generation failed'}</span>
          {onRetry !== undefined && (
            <button type="button" className={styles.retryBtn} onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  const rows = computeRows(status, stage, detail, llmMode, celebrityName);
  const activeRow = rows.find((r) => r.state === 'active') ?? null;

  return (
    <div className={styles.root}>
      <ol className={styles.list} aria-label="Meal plan generation progress">
        {rows.map((row) => {
          const labelClasses = [
            styles.label,
            row.state === 'active' ? styles.labelActive : '',
            row.state === 'done' ? styles.labelDone : '',
          ]
            .filter(Boolean)
            .join(' ');
          const rowClasses = [
            styles.row,
            row.state === 'pending' ? styles.rowFutureFade : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li
              key={row.key}
              className={rowClasses}
              {...(row.state === 'active' ? { 'aria-current': 'step' as const } : {})}
            >
              <Indicator state={row.state} />
              <div className={styles.body}>
                <p className={labelClasses}>{row.label}</p>
                {row.state === 'active' && row.detail !== null && row.detail !== '' ? (
                  <p className={styles.detail}>{row.detail}</p>
                ) : null}
                {row.state === 'active' && row.key === 'selecting_recipes' ? (
                  <ThinkingTicker candidates={candidateRecipes} />
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {activeRow !== null ? activeRow.label : ''}
      </p>
    </div>
  );
}
