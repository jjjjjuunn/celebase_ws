'use client';

import { useEffect } from 'react';

/**
 * Injects @axe-core/react at runtime in dev mode only.
 * In production builds, the effect short-circuits before the dynamic import
 * so @axe-core/react is tree-shaken from the client bundle.
 *
 * Rendered once from the root layout.
 */
export function AxeDevInit(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (typeof window === 'undefined') return;

    void (async () => {
      const [{ default: axe }, React, ReactDOM] = await Promise.all([
        import('@axe-core/react'),
        import('react'),
        import('react-dom'),
      ]);
      try { void axe(React, ReactDOM, 1000); } catch { /* axe incompatible with React 19 ESM getters */ }
    })();
  }, []);

  return null;
}
