import type { Metadata } from 'next';
import Link from 'next/link';

// Draft Privacy Policy. Top-level public route (not in middleware PROTECTED_PREFIXES).
// CONTENT IS A WORKING DRAFT — pending legal review. Data practices below reflect
// docs/runbooks/APP-PRIVACY-MAPPING.md (launch-v1 PHI policy).

export const metadata: Metadata = {
  title: 'Privacy Policy — CelebBase Wellness',
  description: 'Privacy Policy for CelebBase Wellness (draft).',
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
const list = { paddingLeft: 22, margin: '8px 0' };

export default function PrivacyPage() {
  return (
    <main style={main}>
      <div style={container}>
        <p style={banner}>
          <strong>Draft.</strong> This Privacy Policy is a working draft pending legal review. It
          describes our intended data practices; the final policy may differ.
        </p>

        <h1 style={h1}>Privacy Policy</h1>
        <p style={muted}>Last updated: {LAST_UPDATED}</p>

        <h2 style={h2}>1. Overview</h2>
        <p>
          CelebBase Wellness is a health &amp; fitness app. We collect only what we need to run the
          Service and personalize your meal plans. We do not sell your data, and we do not use it
          for advertising or cross-app tracking.
        </p>

        <h2 style={h2}>2. Information We Collect</h2>
        <ul style={list}>
          <li>
            <strong>Account &amp; identifiers:</strong> your email address and an internal account
            identifier (authentication is handled by AWS Cognito; passwords are never stored by us).
          </li>
          <li>
            <strong>Health &amp; fitness (for personalization):</strong> allergies, intolerances,
            activity level, basic body metrics (e.g. height, weight, birth year, sex), and any daily
            logs you choose to record. Provided only if you choose the personalized path.
          </li>
          <li>
            <strong>Purchases:</strong> your subscription tier and status, mirrored from the Apple
            App Store / Google Play (via RevenueCat). We never receive your card details.
          </li>
          <li>
            <strong>Diagnostics:</strong> crash and error events to keep the app stable. These are
            scrubbed of personal and health information before they leave the app.
          </li>
        </ul>

        <h2 style={h2}>3. Sensitive Health Data</h2>
        <p>
          Fields such as biomarkers, medical conditions, and medications are treated as sensitive
          and encrypted with AES-256 at rest. In the current release these are largely not collected
          (an optional GLP-1 indicator is the only medication signal); the rest of the schema is
          reserved for future, explicitly opt-in features.
        </p>

        <h2 style={h2}>4. How We Use Your Information</h2>
        <p>
          We use your information solely to provide app functionality — generating personalized meal
          plans, operating your account, and maintaining the Service. We do not use it for
          advertising, and we do not track you across other apps or websites.
        </p>

        <h2 style={h2}>5. Third-Party Services</h2>
        <ul style={list}>
          <li>
            <strong>AWS Cognito</strong> — authentication (email/social sign-in).
          </li>
          <li>
            <strong>Apple App Store / Google Play / RevenueCat</strong> — subscription processing.
          </li>
          <li>
            <strong>Sentry</strong> — crash and error diagnostics (personal/health data redacted).
          </li>
        </ul>
        <p style={muted}>We do not share your personal data with data brokers.</p>

        <h2 style={h2}>6. Data Retention &amp; Deletion</h2>
        <p>
          You can delete your account at any time in the app (Settings → Delete account). Deletion
          blocks sign-in immediately and starts a 30-day grace period during which you may restore
          the account by signing back in. After the grace period your personal data is permanently
          deleted. Limited records required for legal, security, or financial-audit purposes (e.g.
          access-audit logs) are retained as required by law.
        </p>

        <h2 style={h2}>7. Security</h2>
        <p>
          Data is encrypted in transit (TLS) and sensitive health fields are encrypted at rest
          (AES-256). Access to health data is minimized and audited.
        </p>

        <h2 style={h2}>8. Your Rights</h2>
        <p>
          You may access, correct, or delete your personal information. Account deletion is available
          in-app; for other requests, contact us.
        </p>

        <h2 style={h2}>9. Children</h2>
        <p>The Service is not directed to, and is not intended for, individuals under 18.</p>

        <h2 style={h2}>10. Contact</h2>
        <p>
          Questions about this policy? Email{' '}
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
