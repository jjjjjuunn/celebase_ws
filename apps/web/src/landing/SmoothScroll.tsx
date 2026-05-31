'use client';

import { useEffect, type ReactNode } from 'react';
import Lenis from 'lenis';

// Sticky masthead height — anchor targets land below it (mirrors --cb-topnav-height
// + breathing room; also set as scroll-margin-top in CSS as the no-JS failsafe).
const NAV_OFFSET = 88;

/**
 * Smooth-scroll provider (Lenis). Wraps the whole landing page.
 *
 * Failsafe / accessibility contract:
 *   • If JS never runs, native scrolling + CSS `scroll-margin-top` keep anchors
 *     landing correctly — nothing here is required for content to work.
 *   • `prefers-reduced-motion: reduce` → Lenis is NOT initialised; the browser's
 *     native (instant) scroll is used and anchor clicks fall back to default.
 *   • Anchor clicks (`a[href^="#"]`) are intercepted and eased to their target
 *     with the nav offset, so jumps glide instead of teleporting.
 */
export function SmoothScroll({ children }: { children: ReactNode }): ReactNode {
  useEffect(() => {
    // Always open at the very top on (re)load — don't let the browser restore the
    // previous scroll position. Runs regardless of motion preference.
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number): number => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    // Start Lenis at the top too (in case the browser nudged scroll before init).
    lenis.scrollTo(0, { immediate: true });

    let frame = 0;
    const raf = (time: number): void => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    const onAnchorClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest('a[href^="#"]');
      if (!anchor) {
        return;
      }
      const href = anchor.getAttribute('href');
      if (href === null || href === '#') {
        return;
      }
      const dest = document.querySelector(href);
      if (dest instanceof HTMLElement) {
        event.preventDefault();
        lenis.scrollTo(dest, { offset: -NAV_OFFSET });
        history.replaceState(null, '', href);
      }
    };

    document.addEventListener('click', onAnchorClick);

    return (): void => {
      cancelAnimationFrame(frame);
      document.removeEventListener('click', onAnchorClick);
      lenis.destroy();
    };
  }, []);

  return children;
}
