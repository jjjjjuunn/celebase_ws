'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import styles from './DrumPicker.module.css';

const ITEM_HEIGHT = 36;

export interface DrumPickerProps {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step?: number;
  value: number | undefined;
  defaultValue: number;
  onChange: (value: number) => void;
  required?: boolean;
  helperText?: string;
  showHeader?: boolean;
  formatItem?: (v: number) => string;
  viewportHeight?: number;
  ariaLabel?: string;
}

function clampToItems(items: ReadonlyArray<number>, target: number): number {
  let best = items[0] ?? target;
  let bestDist = Math.abs(target - best);
  for (const v of items) {
    const d = Math.abs(target - v);
    if (d < bestDist) {
      best = v;
      bestDist = d;
    }
  }
  return best;
}

export function DrumPicker(props: DrumPickerProps): ReactElement {
  const {
    id,
    label,
    unit,
    min,
    max,
    step = 1,
    value,
    defaultValue,
    onChange,
    required = false,
    helperText,
    showHeader = true,
    formatItem,
    viewportHeight,
    ariaLabel,
  } = props;

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const settleTimerRef = useRef<number | null>(null);
  const programmaticScrollRef = useRef(false);
  const lastEmittedRef = useRef<number | undefined>(value);
  const rafRef = useRef<number | null>(null);
  const [topOpacity, setTopOpacity] = useState(1);
  const [bottomOpacity, setBottomOpacity] = useState(1);

  const computeEdgeOpacity = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const top = max <= 0 ? 0 : Math.min(1, el.scrollTop / ITEM_HEIGHT);
    const bottom = max <= 0 ? 0 : Math.min(1, (max - el.scrollTop) / ITEM_HEIGHT);
    setTopOpacity(top);
    setBottomOpacity(bottom);
  }, []);

  const updateItemProximity = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const viewportCenterInTrack = viewport.scrollTop + viewport.clientHeight / 2;
    const itemNodes = track.querySelectorAll<HTMLDivElement>('[data-item-index]');
    itemNodes.forEach((node) => {
      const idx = Number(node.dataset['itemIndex']);
      const itemCenter = ITEM_HEIGHT * idx + ITEM_HEIGHT / 2 + 72;
      const distance = Math.abs(itemCenter - viewportCenterInTrack) / ITEM_HEIGHT;
      const clamped = Math.min(distance, 3);
      node.style.setProperty('--item-distance', String(clamped));
    });
  }, []);

  const scheduleProximityUpdate = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updateItemProximity();
    });
  }, [updateItemProximity]);

  const items = useMemo<number[]>(() => {
    const arr: number[] = [];
    for (let v = min; v <= max + 1e-9; v += step) {
      arr.push(Math.round(v * 1000) / 1000);
    }
    return arr;
  }, [min, max, step]);

  const indexOf = useCallback(
    (v: number): number => {
      const clamped = clampToItems(items, v);
      const idx = items.indexOf(clamped);
      return idx < 0 ? 0 : idx;
    },
    [items],
  );

  const activeIndex = value !== undefined ? indexOf(value) : indexOf(defaultValue);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const targetTop = activeIndex * ITEM_HEIGHT;
    programmaticScrollRef.current = true;
    el.scrollTop = targetTop;
    computeEdgeOpacity();
    scheduleProximityUpdate();
    const id = window.requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
    return () => window.cancelAnimationFrame(id);
  }, [activeIndex, computeEdgeOpacity, scheduleProximityUpdate]);

  const handleScroll = useCallback(
    () => {
      const el = viewportRef.current;
      if (!el) return;
      computeEdgeOpacity();
      scheduleProximityUpdate();
      if (programmaticScrollRef.current) {
        return;
      }
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = window.setTimeout(() => {
        const el2 = viewportRef.current;
        if (!el2) return;
        const idx = Math.round(el2.scrollTop / ITEM_HEIGHT);
        const clamped = Math.max(0, Math.min(items.length - 1, idx));
        const next = items[clamped];
        if (next === undefined) return;
        if (next !== lastEmittedRef.current) {
          lastEmittedRef.current = next;
          onChange(next);
        }
      }, 110);
    },
    [items, onChange, computeEdgeOpacity, scheduleProximityUpdate],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const currentIdx = value !== undefined ? indexOf(value) : indexOf(defaultValue);
      let nextIdx: number | null = null;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') nextIdx = Math.max(0, currentIdx - 1);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight')
        nextIdx = Math.min(items.length - 1, currentIdx + 1);
      else if (e.key === 'PageUp') nextIdx = Math.max(0, currentIdx - 10);
      else if (e.key === 'PageDown') nextIdx = Math.min(items.length - 1, currentIdx + 10);
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = items.length - 1;
      if (nextIdx === null) return;
      e.preventDefault();
      const nextVal = items[nextIdx];
      if (nextVal !== undefined && nextVal !== value) {
        lastEmittedRef.current = nextVal;
        onChange(nextVal);
      }
    },
    [value, defaultValue, indexOf, items, onChange],
  );

  const displayValue = value !== undefined ? `${String(value)} ${unit}` : `— ${unit}`;

  const viewportStyle =
    viewportHeight !== undefined ? { height: `${String(viewportHeight)}px` } : undefined;

  return (
    <div className={styles.field}>
      {showHeader ? (
        <div className={styles.labelRow}>
          <label htmlFor={id} className={styles.label}>
            {label}
            {required ? (
              <span aria-hidden="true" className={styles.requiredMark}>
                *
              </span>
            ) : null}
          </label>
          <span className={styles.valueDisplay} data-empty={value === undefined ? 'true' : 'false'}>
            {displayValue}
          </span>
        </div>
      ) : null}
      <div className={styles.drumWrapper}>
        <div
          className={styles.centerIndicatorTop}
          aria-hidden="true"
          style={{ opacity: topOpacity }}
        />
        <div
          className={styles.centerIndicatorBottom}
          aria-hidden="true"
          style={{ opacity: bottomOpacity }}
        />
        <div
          id={id}
          ref={viewportRef}
          className={styles.viewport}
          role="spinbutton"
          aria-label={ariaLabel ?? `${label}, use arrow keys to adjust`}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value ?? defaultValue}
          aria-valuetext={value !== undefined ? `${String(value)} ${unit}` : undefined}
          aria-required={required || undefined}
          tabIndex={0}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          {...(viewportStyle !== undefined ? { style: viewportStyle } : {})}
        >
          <div ref={trackRef} className={styles.track}>
            <div aria-hidden="true" className={styles.pad} />
            {items.map((v, idx) => (
              <div
                key={v}
                className={styles.item}
                data-active={idx === activeIndex ? 'true' : 'false'}
                data-item-index={idx}
              >
                {formatItem !== undefined ? formatItem(v) : v}
              </div>
            ))}
            <div aria-hidden="true" className={styles.pad} />
          </div>
        </div>
      </div>
      {helperText !== undefined ? <span className={styles.helper}>{helperText}</span> : null}
    </div>
  );
}
