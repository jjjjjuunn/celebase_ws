'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export interface UseScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options?: UseScrollRevealOptions,
): { ref: (node: T | null) => void; revealed: boolean } {
  const [revealed, setRevealed] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const once = options?.once ?? true;
  const threshold = options?.threshold ?? 0.12;
  const rootMargin = options?.rootMargin ?? '0px 0px -12% 0px';

  const ref = useCallback(
    (node: T | null): void => {
      if (observerRef.current !== null) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (node === null) return;
      if (prefersReducedMotion()) {
        setRevealed(true);
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setRevealed(true);
              if (once) observer.unobserve(entry.target);
            } else if (!once) {
              setRevealed(false);
            }
          });
        },
        { threshold, rootMargin },
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [threshold, rootMargin, once],
  );

  useEffect(() => {
    return () => {
      if (observerRef.current !== null) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  return { ref, revealed };
}

export function useCountUp(target: number, active: boolean, durationMs = 1400): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    startRef.current = null;
    const tick = (ts: number): void => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, active, durationMs]);

  return value;
}

export function useScrollProgress(): number {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const compute = (): void => {
      const scrolled = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const next = max > 0 ? Math.min(Math.max(scrolled / max, 0), 1) : 0;
      setProgress(next);
    };
    const onScroll = (): void => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        compute();
        rafRef.current = null;
      });
    };
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', compute, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', compute);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return progress;
}

export function useHeroScrollFx<T extends HTMLElement = HTMLDivElement>(): (
  node: T | null,
) => void {
  const cleanupRef = useRef<(() => void) | null>(null);

  const ref = useCallback((node: T | null): void => {
    if (cleanupRef.current !== null) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (node === null) return;
    if (prefersReducedMotion()) return;

    let raf: number | null = null;
    const compute = (): void => {
      const rect = node.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const heroH = rect.height;
      if (heroH === 0) return;
      const delta = Math.max(0, -rect.top);
      const exitProgress = Math.min(Math.max(delta / heroH, 0), 1);
      const parallaxY = delta * 0.28;
      const copyLift = -delta * 0.18;
      const copyOpacity = 1 - Math.min(Math.max((delta - heroH * 0.2) / (heroH * 0.55), 0), 1);
      const scrimIntensity = Math.min(Math.max(delta / (viewportH * 0.6), 0), 1);
      node.style.setProperty('--parallax-y', `${String(parallaxY.toFixed(1))}px`);
      node.style.setProperty('--hero-exit', exitProgress.toFixed(3));
      node.style.setProperty('--copy-y', `${String(copyLift.toFixed(1))}px`);
      node.style.setProperty('--copy-opacity', copyOpacity.toFixed(3));
      node.style.setProperty('--scrim-intensity', scrimIntensity.toFixed(3));
    };
    const onScroll = (): void => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        compute();
        raf = null;
      });
    };
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', compute, { passive: true });
    cleanupRef.current = (): void => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', compute);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (cleanupRef.current !== null) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  return ref;
}
