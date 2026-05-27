import type { Metadata } from 'next';
import Link from 'next/link';

// Public landing for celebase.app. The web client is no longer the active product
// surface (mobile is) — this root page is a marketing front + the home for the
// legal pages (/terms, /privacy) the mobile app links to. `/` is NOT in the
// middleware PROTECTED_PREFIXES, so it renders for everyone.

export const metadata: Metadata = {
  title: 'CelebBase Wellness',
  description:
    'Celebrity-inspired wellness and personalized meal plans, grounded in cited sources. Coming to iOS and Android.',
};

const page = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 20,
  padding: '48px 24px',
  background: 'var(--cb-color-bg)',
  color: 'var(--cb-color-fg)',
  textAlign: 'center' as const,
  fontFamily: 'var(--cb-font-family-body)',
};

const link = { color: 'var(--cb-color-brand)', textDecoration: 'none', fontWeight: 600 };

export default function HomePage() {
  const year = new Date().getFullYear();
  return (
    <main style={page}>
      <h1
        style={{
          fontFamily: 'var(--cb-font-family-display)',
          fontSize: 44,
          fontWeight: 600,
          margin: 0,
        }}
      >
        CelebBase Wellness
      </h1>
      <p style={{ fontSize: 18, maxWidth: 540, lineHeight: 1.5, margin: 0 }}>
        Celebrity-inspired wellness and personalized meal plans, grounded in cited sources.
      </p>
      <p style={{ color: 'var(--cb-color-muted)', margin: 0 }}>
        Coming soon to the App Store and Google Play.
      </p>
      <nav
        style={{
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginTop: 8,
        }}
      >
        <Link href="/terms" style={link}>
          Terms of Service
        </Link>
        <Link href="/privacy" style={link}>
          Privacy Policy
        </Link>
        <Link href="/login" style={{ ...link, color: 'var(--cb-color-muted)' }}>
          Sign in
        </Link>
      </nav>
      <footer style={{ color: 'var(--cb-color-muted)', fontSize: 13, marginTop: 24, maxWidth: 540 }}>
        © {year} CelebBase. For educational purposes only — not medical advice.
      </footer>
    </main>
  );
}
