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
      name !== '@react-native-google-signin/google-signin'
    );
  });

  plugins.push('expo-apple-authentication');

  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
  if (iosUrlScheme) {
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
  }

  return { ...config, plugins };
};
