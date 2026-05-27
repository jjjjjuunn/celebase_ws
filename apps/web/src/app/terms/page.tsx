import type { Metadata } from 'next';
import Link from 'next/link';

// Draft Terms of Service. Top-level public route (not in middleware PROTECTED_PREFIXES).
// CONTENT IS A WORKING DRAFT — pending legal review, not binding final terms.

export const metadata: Metadata = {
  title: 'Terms of Service — CelebBase Wellness',
  description: 'Terms of Service for CelebBase Wellness (draft).',
};

const LAST_UPDATED = 'May 27, 2026';
const SUPPORT_EMAIL = 'support@celebase.app';

const main = {
  minHeight: '100vh',
  background: 'var(--cb-color-bg)',
  color: 'var(--cb-color-fg)',
  fontFamily: 'var(--cb-font-family-body)',
  padding: '48px 24px',
};
const container = { maxWidth: 720, margin: '0 auto', lineHeight: 1.6 };
const banner = {
  border: '1px solid var(--cb-color-border)',
  borderRadius: 10,
  padding: '12px 16px',
  color: 'var(--cb-color-muted)',
  fontSize: 14,
  marginBottom: 28,
};
const h1 = { fontFamily: 'var(--cb-font-family-display)', fontSize: 34, fontWeight: 600, margin: '0 0 4px' };
const h2 = { fontFamily: 'var(--cb-font-family-display)', fontSize: 20, fontWeight: 600, marginTop: 28 };
const muted = { color: 'var(--cb-color-muted)', fontSize: 14 };

export default function TermsPage() {
  return (
    <main style={main}>
      <div style={container}>
        <p style={banner}>
          <strong>Draft.</strong> These Terms are a working draft pending legal review and are not
          the final, binding Terms of Service.
        </p>

        <h1 style={h1}>Terms of Service</h1>
        <p style={muted}>Last updated: {LAST_UPDATED}</p>

        <h2 style={h2}>1. Acceptance of Terms</h2>
        <p>
          By creating an account or using CelebBase Wellness (the &ldquo;Service&rdquo;), you agree
          to these Terms. If you do not agree, do not use the Service.
        </p>

        <h2 style={h2}>2. The Service</h2>
        <p>
          CelebBase Wellness provides celebrity-inspired wellness information and personalized meal
          plans assembled from publicly available, cited sources. Content is provided for
          informational and educational purposes only.
        </p>

        <h2 style={h2}>3. Eligibility &amp; Accounts</h2>
        <p>
          You must be at least 18 years old to use the Service. You are responsible for the accuracy
          of the information you provide and for keeping your sign-in credentials secure.
        </p>

        <h2 style={h2}>4. Subscriptions &amp; Payments</h2>
        <p>
          Paid plans are sold and billed through the Apple App Store or Google Play. Subscriptions
          auto-renew unless cancelled, and are managed in your store account settings. Refunds and
          billing are handled by the respective store under its terms.
        </p>

        <h2 style={h2}>5. Health Disclaimer</h2>
        <p>
          This information is for educational purposes only and is not intended as medical advice.
          Consult a qualified healthcare professional before making changes to your diet, especially
          if you have a medical condition. Calorie targets are subject to a safe lower bound and a
          recommendation to consult a physician.
        </p>

        <h2 style={h2}>6. Acceptable Use</h2>
        <p>
          You agree not to misuse the Service, attempt to access it by unauthorized means, scrape or
          resell its content, or interfere with its operation or security.
        </p>

        <h2 style={h2}>7. Intellectual Property</h2>
        <p>
          The Service, its content, and trademarks are owned by CelebBase or its licensors. Source
          material referenced in content remains the property of its respective owners.
        </p>

        <h2 style={h2}>8. Disclaimers &amp; Limitation of Liability</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; without warranties of any kind. To the maximum
          extent permitted by law, CelebBase is not liable for any indirect, incidental, or
          consequential damages arising from your use of the Service.
        </p>

        <h2 style={h2}>9. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will be communicated through
          the app or by email. Continued use after changes take effect constitutes acceptance.
        </p>

        <h2 style={h2}>10. Contact</h2>
        <p>
          Questions about these Terms? Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--cb-color-brand)' }}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>

        <p style={{ marginTop: 36 }}>
          <Link href="/" style={{ color: 'var(--cb-color-brand)', fontWeight: 600 }}>
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
