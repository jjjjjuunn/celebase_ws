'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Reveal delay in seconds (for manual staggering between sibling blocks). */
  delay?: number;
  /** Vertical travel distance before reveal. */
  y?: number;
  /** Horizontal travel distance before reveal (used for the "spread from centre" effect). */
  x?: number;
  /** Starting scale before reveal (1 = none). A touch under 1 gives a subtle "settle in". */
  scale?: number;
}

/**
 * Scroll-triggered reveal with a strict no-JS / reduced-motion failsafe.
 *
 *   • SSR + pre-hydration render fully visible (opacity 1) — content is NEVER
 *     hidden without JS, and there is no hydration mismatch.
 *   • After hydration (motion allowed), out-of-view blocks snap hidden INSTANTLY
 *     (0 s) — they are off-screen so the snap is imperceptible — then ease into
 *     view (0.6 s) as the user scrolls to them.
 *   • `prefers-reduced-motion: reduce` keeps everything static + visible.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 34,
  x = 0,
  scale = 0.985,
}: RevealProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: '0px 0px -12% 0px' });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const active = hydrated && reduced !== true;
  const show = !active || inView;

  const style: CSSProperties = active ? { willChange: 'opacity, transform' } : {};

  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial={false}
      animate={{
        opacity: show ? 1 : 0,
        y: show ? 0 : y,
        x: show ? 0 : x,
        scale: show ? 1 : scale,
      }}
      transition={{
        duration: show ? 0.7 : 0,
        delay: show ? delay : 0,
        ease: [0.2, 0, 0, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
