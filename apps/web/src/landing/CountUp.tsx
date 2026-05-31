'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';

interface CountUpProps {
  /** Final value (always rendered verbatim in SSR / reduced-motion — the failsafe). */
  to: number;
  duration?: number;
  className?: string;
  /** Deterministic formatter (avoid toLocaleString → SSR/client locale drift). */
  format?: (value: number) => string;
}

/**
 * Counts a number up when it scrolls into view. Failsafe: the final value is the
 * SSR output and the reduced-motion output, so the correct number is always shown
 * even with no JS.
 */
export function CountUp({ to, duration = 1.4, className, format }: CountUpProps): ReactNode {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const [display, setDisplay] = useState(to);
  const displayRef = useRef(to);
  const [hydrated, setHydrated] = useState(false);
  const revealed = useRef(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const active = hydrated && reduced !== true;

  useEffect(() => {
    const set = (value: number): void => {
      displayRef.current = value;
      setDisplay(value);
    };
    // No JS animation → always show the true final value (SSR / reduced-motion).
    if (!active) {
      set(to);
      return;
    }
    // Before the first reveal, hold a teaser start value.
    if (!inView) {
      if (!revealed.current) {
        set(Math.round(to * 0.35));
      }
      return;
    }
    // First reveal counts up from the teaser; later `to` changes (e.g. switching
    // persona tabs) re-count from the value currently on screen.
    const from = revealed.current ? displayRef.current : Math.round(to * 0.35);
    revealed.current = true;
    const controls = animate(from, to, {
      duration,
      ease: [0.2, 0, 0, 1],
      onUpdate: (value: number): void => set(Math.round(value)),
    });
    return (): void => controls.stop();
  }, [active, inView, to, duration]);

  const fmt = format ?? ((n: number): string => String(n));
  return (
    <span ref={ref} className={className}>
      {fmt(display)}
    </span>
  );
}

/** Comma-grouped integer formatter (deterministic, locale-independent). */
export function withCommas(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
