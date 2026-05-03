import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  const tNav = useTranslations('nav');
  const tApp = useTranslations('app');

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--cb-color-bg)',
        color: 'var(--cb-color-fg)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: '20px 32px',
          borderBottom: '1px solid var(--cb-color-border)',
          position: 'sticky',
          top: 0,
          background: 'var(--cb-color-bg)',
          zIndex: 10,
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: 'var(--cb-font-family-display)',
            fontWeight: 600,
            color: 'var(--cb-color-fg)',
            textDecoration: 'none',
          }}
        >
          {tApp('name')}
        </Link>
        <nav style={{ display: 'flex', gap: 20, marginLeft: 'auto' }}>
          <Link href="/" style={{ color: 'var(--cb-color-fg)' }}>
            {tNav('home')}
          </Link>
          <Link href="/celebrities" style={{ color: 'var(--cb-color-fg)' }}>
            {tNav('celebrities')}
          </Link>
          <Link href="/recipes" style={{ color: 'var(--cb-color-fg)' }}>
            {tNav('recipes')}
          </Link>
          <Link href="/login" style={{ color: 'var(--cb-color-fg)' }}>
            {tNav('account')}
          </Link>
        </nav>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
