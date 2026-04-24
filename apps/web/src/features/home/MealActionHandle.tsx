'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './MealActionHandle.module.css';

export type MealStatus = 'scheduled' | 'completed' | 'skipped';

interface Props {
  status: MealStatus;
  mealTypeLabel: string;
  dateIso: string;
  onComplete: () => void;
  onSkip: () => void;
}

// Plan 22 · Phase C2 — swipe + keyboard action surface for meal cards.
// Swipe-left (horizontal pointer drag ≥ 60px) → skip.
// Swipe-right → complete.
// Keyboard: Enter = complete, Delete/Backspace = skip.
// `touch-action: pan-y` keeps vertical scroll intact on mobile.
const SWIPE_THRESHOLD_PX = 60;

export function MealActionHandle({
  status,
  mealTypeLabel,
  dateIso,
  onComplete,
  onSkip,
}: Props): React.ReactElement {
  const [dragDx, setDragDx] = useState<number>(0);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef<number>(0);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    if (status !== 'scheduled') return;
    pointerIdRef.current = e.pointerId;
    startXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [status]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    if (pointerIdRef.current !== e.pointerId) return;
    setDragDx(e.clientX - startXRef.current);
  }, []);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    if (pointerIdRef.current !== e.pointerId) return;
    const dx = e.clientX - startXRef.current;
    pointerIdRef.current = null;
    setDragDx(0);
    if (dx <= -SWIPE_THRESHOLD_PX) {
      onSkip();
    } else if (dx >= SWIPE_THRESHOLD_PX) {
      onComplete();
    }
  }, [onComplete, onSkip]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (status !== 'scheduled') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      onComplete();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onSkip();
    }
  }, [onComplete, onSkip, status]);

  useEffect(() => {
    if (status !== 'scheduled') setDragDx(0);
  }, [status]);

  const ariaLabel =
    status === 'scheduled'
      ? `${mealTypeLabel} on ${dateIso}. Press Enter to complete, Delete to skip. Swipe left to skip, swipe right to complete.`
      : status === 'completed'
        ? `${mealTypeLabel} on ${dateIso} — completed.`
        : `${mealTypeLabel} on ${dateIso} — skipped.`;

  const visualOffset = Math.max(-80, Math.min(80, dragDx));

  return (
    <div
      role="button"
      tabIndex={status === 'scheduled' ? 0 : -1}
      aria-label={ariaLabel}
      aria-disabled={status === 'scheduled' ? undefined : 'true'}
      className={
        status === 'completed'
          ? styles.handleCompleted
          : status === 'skipped'
            ? styles.handleSkipped
            : styles.handle
      }
      style={{ transform: `translateX(${String(visualOffset)}px)` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
    >
      <span className={styles.hint} aria-hidden="true">
        {status === 'completed'
          ? '✓ Logged'
          : status === 'skipped'
            ? 'Skipped'
            : 'Swipe ← skip · Swipe → log'}
      </span>
    </div>
  );
}
