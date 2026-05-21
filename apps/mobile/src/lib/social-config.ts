// Social-login configuration helpers — IMPL-MOBILE-SOCIAL-001.
//
// Deliberately free of any `aws-amplify` import so screens / buttons can read
// the feature-enabled flag at module-load without pulling the heavy Amplify
// barrel (its RN `.ts` source is outside jest's transform scope — see
// __tests__/lib/cognito.test.ts). The actual sign-in trigger lives in
// services/social-auth.ts and is lazy-imported only when a button is pressed.

/** Social providers we wire to Cognito Hosted UI. Matches Amplify's OAuthProvider. */
export type SocialProvider = 'Google' | 'Apple';

// Custom URL scheme — MUST match app.json `scheme` AND the Terraform
// `mobile_callback_urls` / `mobile_logout_urls` defaults (infra/cognito).
// Defined once here so all three stay in lockstep. NOTE: single-b "celebase"
// is the brand (the Cognito Hosted-UI *domain* stays "celebbase-staging" — a
// separate, already-deployed identifier; do not conflate the two).
export const OAUTH_SCHEME = 'celebase';
export const OAUTH_REDIRECT_SIGN_IN = `${OAUTH_SCHEME}://callback/`;
export const OAUTH_REDIRECT_SIGN_OUT = `${OAUTH_SCHEME}://signout/`;

/**
 * Parse EXPO_PUBLIC_SOCIAL_PROVIDERS ("Google,Apple") into a validated list.
 * Returns [] when unset/empty — the signal that social login is not configured.
 * Unknown entries are dropped (defensive — never crash on a typo'd env).
 */
export function readSocialProviders(): SocialProvider[] {
  const raw: unknown = process.env['EXPO_PUBLIC_SOCIAL_PROVIDERS'];
  if (typeof raw !== 'string' || raw === '') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is SocialProvider => s === 'Google' || s === 'Apple');
}

/** Hosted-UI domain (no scheme), e.g. "celebbase-staging.auth.us-west-2.amazoncognito.com". */
export function readHostedUiDomain(): string | undefined {
  const raw: unknown = process.env['EXPO_PUBLIC_COGNITO_HOSTED_UI_DOMAIN'];
  return typeof raw === 'string' && raw !== '' ? raw : undefined;
}

/**
 * True only when BOTH a Hosted-UI domain and ≥1 provider are configured.
 * Screens gate the social buttons on this; configureCognito gates the
 * `loginWith.oauth` block on this. When false the app behaves exactly as before
 * (email/password SRP only) — so it runs anywhere, even before social setup.
 */
export function isSocialAuthEnabled(): boolean {
  return readHostedUiDomain() !== undefined && readSocialProviders().length > 0;
}
