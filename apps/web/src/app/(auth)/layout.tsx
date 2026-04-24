import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function AuthLayout({ children }: { children: ReactNode }) {
  const tApp = useTranslations('app');

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--cb-color-bg-muted, var(--cb-color-bg))',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          padding: 32,
          borderRadius: 'var(--cb-radius-lg, 12px)',
          background: 'var(--cb-color-bg)',
          border: '1px solid var(--cb-color-border)',
          boxShadow: 'var(--cb-shadow-md, 0 4px 12px rgba(0,0,0,0.06))',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: 'var(--cb-font-family-display)',
            fontWeight: 600,
            fontSize: 20,
            color: 'var(--cb-color-fg)',
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          {tApp('name')}
        </Link>
        {children}
      </div>
    </div>
  );
}
