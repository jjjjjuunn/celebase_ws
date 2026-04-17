'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTheme, type ThemeMode } from '@celebbase/ui-kit';

type Viewport = '375' | '768' | '1440';

const VIEWPORT_WIDTHS: Record<Viewport, number> = {
  '375': 375,
  '768': 768,
  '1440': 1440,
};

export default function SliceLayout({ children }: { children: ReactNode }) {
  const { mode, setMode } = useTheme();
  const [viewport, setViewport] = useState<Viewport>('1440');

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--cb-color-bg)',
      }}
    >
      <header
        style={{
          display: 'flex',
          gap: 16,
          padding: '16px 24px',
          borderBottom: '1px solid var(--cb-color-border)',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: 'var(--cb-color-bg)',
          zIndex: 10,
        }}
      >
        <strong style={{ fontFamily: 'var(--cb-font-family-display)' }}>
          CelebBase / Slice
        </strong>
        <nav style={{ display: 'flex', gap: 12, marginLeft: 'auto' }}>
          <a href="/slice/tokens">tokens</a>
          <a href="/slice/components">components</a>
        </nav>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>theme</span>
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as ThemeMode);
            }}
          >
            <option value="system">system</option>
            <option value="light">light</option>
            <option value="dark">dark</option>
          </select>
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>viewport</span>
          <select
            value={viewport}
            onChange={(e) => {
              setViewport(e.target.value as Viewport);
            }}
          >
            <option value="375">375 (mobile)</option>
            <option value="768">768 (tablet)</option>
            <option value="1440">1440 (desktop)</option>
          </select>
        </label>
      </header>
      <div
        style={{
          width: VIEWPORT_WIDTHS[viewport],
          maxWidth: '100%',
          margin: '0 auto',
          padding: 24,
          flex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
