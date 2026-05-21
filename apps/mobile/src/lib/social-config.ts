// Native social-login configuration helpers — IMPL-MOBILE-SOCIAL-NATIVE-001.
//
// Deliberately free of any native-module import (expo-apple-authentication /
// @react-native-google-signin) so screens / buttons can read the
// feature-enabled flags at module-load without pulling those native binaries
// (absent under jest). The actual sign-in calls live in services/social-auth.ts
// and are lazy-imported only when a button is pressed.
//
// PIVOT (IMPL-MOBILE-SOCIAL-NATIVE-001): social sign-in no longer uses Cognito
// Hosted-UI federation. Apple uses the native expo-apple-authentication sheet;
// Google uses the native @react-native-google-signin picker. Each yields a
// provider id_token verified directly by user-service. There is no Hosted-UI
// domain anymore — gating is per-provider on the env below.

/** Social providers. Matches the labels in EXPO_PUBLIC_SOCIAL_PROVIDERS. */
export type SocialProvider = 'Google' | 'Apple';

// Custom URL scheme — MUST match app.json `scheme`. Single-b "celebase" is the
// brand. (Google's native redirect uses its own reversed-client-ID URL scheme,
// configured via the EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME plugin arg, NOT this.)
export const OAUTH_SCHEME = 'celebase';

/**
 * Parse EXPO_PUBLIC_SOCIAL_PROVIDERS ("Google,Apple") into a validated list.
 * Returns [] when unset/empty — the signal that social login is not enabled.
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

/** Native Google sign-in config. Both client IDs are required for an idToken. */
export interface GoogleNativeConfig {
  /** iOS OAuth client ID — initializes the native GIDSignIn SDK. */
  iosClientId: string;
  /** Web OAuth client ID — the idToken `aud`; user-service verifies against it. */
  webClientId: string;
}

/**
 * Read the native Google config. Returns undefined unless BOTH client IDs are
 * present — partial config would yield an idToken with no verifiable audience.
 */
export function readGoogleNativeConfig(): GoogleNativeConfig | undefined {
  const iosClientId: unknown = process.env['EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'];
  const webClientId: unknown = process.env['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'];
  if (
    typeof iosClientId !== 'string' ||
    iosClientId === '' ||
    typeof webClientId !== 'string' ||
    webClientId === ''
  ) {
    return undefined;
  }
  return { iosClientId, webClientId };
}

/** Google button shows only when listed in providers AND fully configured. */
export function isGoogleConfigured(): boolean {
  return readSocialProviders().includes('Google') && readGoogleNativeConfig() !== undefined;
}

/**
 * Apple button shows when listed in providers. Native availability (iOS only;
 * device/OS support) is checked at press time in services/social-auth.ts and
 * gated by Platform.OS in the button — no env beyond the providers list.
 */
export function isAppleConfigured(): boolean {
  return readSocialProviders().includes('Apple');
}

/**
 * True when at least one social provider is usable. Screens gate the social
 * buttons block on this; when false the app behaves exactly as before
 * (email/password SRP only) — so it runs anywhere, even before social setup.
 */
export function isSocialAuthEnabled(): boolean {
  return isGoogleConfigured() || isAppleConfigured();
}
