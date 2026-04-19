import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function AppLayout({ children }: { children: ReactNode }) {
  const tNav = useTranslations('nav');
  const tApp = useTranslations('app');

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
        background: 'var(--cb-color-bg)',
        color: 'var(--cb-color-fg)',
      }}
    >
      <aside
        style={{
          borderRight: '1px solid var(--cb-color-border)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <Link
          href="/dashboard"
          style={{
            fontFamily: 'var(--cb-font-family-display)',
            fontWeight: 600,
            color: 'var(--cb-color-fg)',
            textDecoration: 'none',
          }}
        >
          {tApp('name')}
        </Link>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link href="/dashboard" style={{ color: 'var(--cb-color-fg)' }}>
            {tNav('dashboard')}
          </Link>
          <Link href="/plans" style={{ color: 'var(--cb-color-fg)' }}>
            {tNav('plans')}
          </Link>
          <Link href="/account" style={{ color: 'var(--cb-color-fg)' }}>
            {tNav('account')}
          </Link>
        </nav>
      </aside>
      <main style={{ padding: 32 }}>{children}</main>
    </div>
  );
}
