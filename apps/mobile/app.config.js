// Dynamic Expo config (IMPL-MOBILE-SOCIAL-NATIVE-001).
//
// Expo reads app.json first and passes it here as `config`; this function has
// the final say. We own the native social `plugins` here (rather than in the
// static app.json) because the Google plugin needs the iOS *reversed client ID*
// at PREBUILD time, and we read it from EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME so the
// repository carries no per-environment OAuth client IDs.
//
// "Runs anywhere" contract:
//   - expo-apple-authentication is ALWAYS added (no-op on Android; adds the
//     "Sign in with Apple" entitlement on iOS).
//   - The Google plugin is added ONLY when EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME is
//     set. Without it the app still prebuilds + runs, and Apple sign-in works;
//     Google sign-in stays dormant until the env is populated.
module.exports = ({ config }) => {
  // Drop any pre-existing entries for the two plugins so we re-add them
  // canonically (idempotent across `expo install` auto-edits / re-runs).
  const plugins = (config.plugins ?? []).filter((p) => {
    const name = Array.isArray(p) ? p[0] : p;
    return (
      name !== 'expo-apple-authentication' &&
      name !== '@react-native-google-signin/google-signin' &&
      name !== 'expo-image-picker' &&
      name !== '@sentry/react-native'
    );
  });

  plugins.push('expo-apple-authentication');

  // FEAT-PROFILE-EDIT — profile photo picking. iOS Info.plist photo-library
  // usage string is set here; no camera permission (gallery only).
  plugins.push([
    'expo-image-picker',
    {
      photosPermission: 'Celebase uses your photos so you can set a profile picture.',
    },
  ]);

  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
  if (iosUrlScheme) {
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
  }

  // Sentry native crash symbolication + source-map upload at prebuild. Added only
  // when a DSN is configured (CHORE-SENTRY-PHI-REDACTION-001) — without it the app
  // still prebuilds + runs and Sentry stays dormant. Source-map upload also needs
  // build-time SENTRY_AUTH_TOKEN / org / project (see docs handoff).
  if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
    plugins.push('@sentry/react-native');
  }

  return { ...config, plugins };
};
