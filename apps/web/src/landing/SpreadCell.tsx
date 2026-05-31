'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

interface SpreadCellProps {
  /** Position of this cell in the row. */
  index: number;
  /** Total cells in the row (to find the centre). */
  count: number;
  /** Horizontal converge distance per step away from centre, in px. */
  step: number;
  /** Starting scale at the converged (centre) state. */
  startScale?: number;
  /** class for the <li> grid/scroll item. */
  className?: string;
  /** class for the inner motion wrapper (layout — e.g. flex column / height). */
  innerClassName?: string;
  children: ReactNode;
}

/**
 * A scroll-LINKED "spread from the centre" cell. Unlike a one-shot reveal, the
 * transform is tied to scroll position: as the row rises into view the cell
 * spreads out from the centre; scrolling back up re-converges it.
 *
 * Failsafe: SSR / pre-hydration / reduced-motion render the final, fully-visible
 * state (no transform, opacity 1) — content is never hidden without JS.
 */
export function SpreadCell({
  index,
  count,
  step,
  startScale = 0.84,
  className,
  innerClassName,
  children,
}: SpreadCellProps): ReactNode {
  const ref = useRef<HTMLLIElement>(null);
  const reduced = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const center = (count - 1) / 2;
  const startX = (center - index) * step;
  const dist = Math.abs(index - center);
  // Outer cells finish a little later → the row opens outward from the middle.
  const end = Math.min(0.92, 0.6 + dist * 0.1);

  // Resolve quickly within the bottom of the viewport: the row is settled
  // (opacity 1, no transform) by the time it's comfortably on screen — it only
  // spreads/re-converges in the entry band, never sits half-faded while you read.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'start 0.72'],
  });
  const x = useTransform(scrollYProgress, [0, end], [startX, 0]);
  const scale = useTransform(scrollYProgress, [0, end], [startScale, 1]);
  const opacity = useTransform(scrollYProgress, [0, end * 0.85], [0, 1]);

  const active = hydrated && reduced !== true;
  const style = active
    ? { x, scale, opacity, height: '100%', willChange: 'transform, opacity' }
    : { height: '100%' };

  return (
    <li ref={ref} className={className}>
      <motion.div className={innerClassName} style={style}>
        {children}
      </motion.div>
    </li>
  );
}
