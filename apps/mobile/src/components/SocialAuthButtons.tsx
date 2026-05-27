// Social sign-in buttons (Google / Apple) — IMPL-MOBILE-SOCIAL-NATIVE-001.
//
// Rendered on Login + Signup screens. Each button shows only when its provider
// is configured — Apple when listed in EXPO_PUBLIC_SOCIAL_PROVIDERS and running
// on iOS; Google when listed AND the native client IDs are present. When
// nothing is configured the block returns null and the screens look exactly as
// before (email/password only) — the feature ships dormant (runs anywhere).
//
// Apple is listed first per App Store HIG ("Sign in with Apple" prominence).
// Sign-in uses the NATIVE sheet/picker (expo-apple-authentication /
// @react-native-google-signin), not Cognito Hosted UI. Apple/Google buttons keep
// brand-specific colors (not the ui Button primitive) per each provider's HIG:
//   Apple  — black fill + white Apple logo glyph (U+F8FF, rendered in the system
//            font so iOS substitutes the real mark) + approved "Continue with" text.
//   Google — white fill + hairline border + label. (Official 4-colour "G" needs
//            react-native-svg / an image asset + a native rebuild — deferred so the
//            JS-only redesign stays reload-safe.)
// Both share one height (52) + radius so they read as a coherent pair.

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text as RNText,
  TouchableOpacity,
  View,
} from 'react-native';

import { ApiError } from '../lib/api-client';
import { AccountDeletedError } from '../lib/auth-errors';
import { isAppleConfigured, isGoogleConfigured, type SocialProvider } from '../lib/social-config';
import { signInWithSocial } from '../services/social-auth';
import { Text, useTheme, type Theme } from '../ui';

interface SocialAuthButtonsProps {
  /** Disable while the parent (email/password) flow is submitting. */
  disabled?: boolean;
  /** Called after a successful social sign-in (tokens already stored). */
  onSuccess: () => void;
  /** Called with a user-facing message on failure (empty = clear/no message). */
  onError: (message: string) => void;
  /** IMPL-ACCOUNT-RESTORE-001: a soft-deleted social account hit ACCOUNT_DELETED.
   * The error carries the verified id_token so the parent can offer restore. If
   * omitted, the deletion surfaces as a plain error message instead. */
  onAccountDeleted?: (err: AccountDeletedError) => void;
}

// Apple first (HIG), then Google. Filtered to the configured providers.
const PROVIDER_ORDER: readonly SocialProvider[] = ['Apple', 'Google'];

const LABELS: Record<SocialProvider, string> = {
  Apple: 'Continue with Apple',
  Google: 'Continue with Google',
};

export function SocialAuthButtons({
  disabled = false,
  onSuccess,
  onError,
  onAccountDeleted,
}: SocialAuthButtonsProps): React.JSX.Element | null {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [pending, setPending] = useState<SocialProvider | null>(null);

  // Apple is iOS-only (native sheet); Google needs its client IDs. Filtering
  // here means the divider + buttons appear only when ≥1 provider is usable.
  const providers = PROVIDER_ORDER.filter((p) =>
    p === 'Apple' ? isAppleConfigured() && Platform.OS === 'ios' : isGoogleConfigured(),
  );
  if (providers.length === 0) return null;

  async function handlePress(provider: SocialProvider): Promise<void> {
    onError('');
    setPending(provider);
    try {
      await signInWithSocial(provider);
      onSuccess();
    } catch (err) {
      // IMPL-ACCOUNT-RESTORE-001: route a soft-deleted social account to the
      // parent's restore handler (carries the verified id_token) when provided.
      if (err instanceof AccountDeletedError && onAccountDeleted !== undefined) {
        onAccountDeleted(err);
        return;
      }
      const message = mapSocialError(err);
      if (message !== null) onError(message);
    } finally {
      setPending(null);
    }
  }

  const busy = disabled || pending !== null;

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text variant="bodySm" tone="muted" style={styles.dividerText}>
          or
        </Text>
        <View style={styles.dividerLine} />
      </View>

      {providers.map((provider) => {
        const isApple = provider === 'Apple';
        const labelColor = isApple ? theme.color.onInk : theme.color.text;
        return (
          <TouchableOpacity
            key={provider}
            accessibilityRole="button"
            accessibilityLabel={LABELS[provider]}
            testID={`social-${provider.toLowerCase()}`}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => {
              void handlePress(provider);
            }}
            style={[
              styles.button,
              isApple ? styles.appleButton : styles.googleButton,
              busy && styles.buttonDisabled,
            ]}
          >
            {pending === provider ? (
              <ActivityIndicator color={labelColor} />
            ) : (
              <View style={styles.buttonInner}>
                {isApple ? (
                  // U+F8FF renders the Apple logo in the system font (SF). Built from a
                  // charcode (pure ASCII source) so the private-use glyph is never stripped.
                  <RNText style={[styles.appleGlyph, { color: labelColor }]}>
                    {String.fromCharCode(0xf8ff)}
                  </RNText>
                ) : null}
                <Text variant="body" style={[styles.buttonText, { color: labelColor }]}>
                  {LABELS[provider]}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * Map a social sign-in failure to a user-facing message.
 * Returns null for user-initiated cancellation (no message — not an error).
 */
const GENERIC_SOCIAL_ERROR = 'Social sign-in failed. Please try again.';

function mapSocialError(err: unknown): string | null {
  if (err instanceof ApiError) {
    if (err.code === 'ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER') {
      return 'This email is already registered with a different sign-in method. Sign in with your original method, then link it in Settings.';
    }
    // 빈 message 를 그대로 내보내면 FormErrorBox 가 빈 박스를 띄운다 — generic 으로 대체.
    return err.message !== '' ? err.message : GENERIC_SOCIAL_ERROR;
  }
  if (err instanceof Error) {
    // Native sheet/picker dismissal → not an error (SocialCancelledError, or a
    // provider SDK cancel surfaced by name/message).
    if (
      err.name === 'SocialCancelledError' ||
      /cancel/i.test(err.name) ||
      /cancel/i.test(err.message)
    ) {
      return null;
    }
    return err.message !== '' ? err.message : GENERIC_SOCIAL_ERROR;
  }
  return GENERIC_SOCIAL_ERROR;
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { marginTop: theme.space(4) },
    dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.space(3) },
    dividerLine: { flex: 1, height: 1, backgroundColor: theme.color.border },
    dividerText: { marginHorizontal: theme.space(2) },
    button: {
      height: 52,
      borderRadius: theme.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.space(2),
    },
    buttonInner: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
    appleButton: { backgroundColor: theme.color.text },
    googleButton: {
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { fontWeight: theme.weight.semibold },
    // U+F8FF maps to the Apple logo only in the system font (SF) — pin it explicitly.
    appleGlyph: { fontFamily: 'System', fontSize: 18, marginTop: -2 },

  });
}
