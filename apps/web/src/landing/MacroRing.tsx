'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { CountUp, withCommas } from './CountUp';
import styles from './landing.module.css';

const CHART_VAR: Record<'protein' | 'weight' | 'calories', string> = {
  protein: 'var(--cb-chart-protein)',
  weight: 'var(--cb-chart-weight)',
  calories: 'var(--cb-chart-calories)',
};

export interface RingMacro {
  label: string;
  pct: number;
  token: 'protein' | 'weight' | 'calories';
}

interface MacroRingProps {
  macros: readonly RingMacro[];
  centerValue: number;
  centerUnit: string;
  /** Accessible description of the split. */
  label: string;
}

const GAP = 0.014; // fraction of the circle left blank between segments

/**
 * Animated macro donut. Each segment draws on (stroke pathLength 0→f) when the
 * ring scrolls into view; the centre kcal value counts up. Failsafe: SSR and
 * reduced-motion render the complete ring + final number.
 */
export function MacroRing({ macros, centerValue, centerUnit, label }: MacroRingProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: '0px 0px -12% 0px' });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const active = hydrated && reduced !== true;
  const show = !active || inView;

  let cursor = 0;
  const segments = macros.map((m) => {
    const fraction = m.pct / 100;
    const offset = cursor + GAP / 2;
    const drawLen = Math.max(fraction - GAP, 0.001);
    cursor += fraction;
    return { ...m, offset, drawLen };
  });

  return (
    <div ref={ref} className={styles.ringWrap}>
      <div className={styles.ringStack}>
        <svg
          viewBox="0 0 200 200"
          className={styles.ringSvg}
          role="img"
          aria-label={label}
        >
          {/* track */}
          <circle
            cx="100"
            cy="100"
            r="82"
            fill="none"
            stroke="color-mix(in srgb, var(--cb-color-text) 8%, transparent)"
            strokeWidth="15"
          />
          {/* rotate on a plain <g> so framer's transform handling on the
              segments is never overridden */}
          <g transform="rotate(-90 100 100)">
            {segments.map((seg) => (
              <motion.circle
                key={seg.label}
                cx="100"
                cy="100"
                r="82"
                fill="none"
                stroke={CHART_VAR[seg.token]}
                strokeWidth="15"
                strokeLinecap="round"
                initial={false}
                animate={{ pathLength: show ? seg.drawLen : 0, pathOffset: seg.offset }}
                transition={{ duration: show ? 1.1 : 0, ease: [0.2, 0, 0, 1] }}
              />
            ))}
          </g>
        </svg>
        <div className={styles.ringCenter} aria-hidden="true">
          <CountUp
            key={centerValue}
            to={centerValue}
            className={styles.ringValue}
            format={withCommas}
          />
          <span className={styles.ringUnit}>{centerUnit}</span>
        </div>
      </div>
    </div>
  );
}
