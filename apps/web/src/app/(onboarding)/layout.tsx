import type { ReactNode } from 'react';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 'clamp(24px, 6vh, 72px) 16px',
        background: 'var(--cb-color-bg)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
        }}
      >
        {children}
      </div>
    </div>
  );
}
