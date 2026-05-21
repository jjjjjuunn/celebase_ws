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
// @react-native-google-signin), not Cognito Hosted UI.

import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { tokens } from '@celebbase/design-tokens';

import { ApiError } from '../lib/api-client';
import { isAppleConfigured, isGoogleConfigured, type SocialProvider } from '../lib/social-config';
import { signInWithSocial } from '../services/social-auth';
import { px, resolveToken } from '../lib/tokens';

interface SocialAuthButtonsProps {
  /** Disable while the parent (email/password) flow is submitting. */
  disabled?: boolean;
  /** Called after a successful social sign-in (tokens already stored). */
  onSuccess: () => void;
  /** Called with a user-facing message on failure (empty = clear/no message). */
  onError: (message: string) => void;
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
}: SocialAuthButtonsProps): React.JSX.Element | null {
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
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      {providers.map((provider) => {
        const isApple = provider === 'Apple';
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
              <ActivityIndicator
                color={resolveToken('light', isApple ? '--cb-color-bg' : '--cb-color-text')}
              />
            ) : (
              <Text style={[styles.buttonText, isApple ? styles.appleText : styles.googleText]}>
                {LABELS[provider]}
              </Text>
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
function mapSocialError(err: unknown): string | null {
  if (err instanceof ApiError) {
    if (err.code === 'ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER') {
      return 'This email is already registered with a different sign-in method. Sign in with your original method, then link it in Settings.';
    }
    return err.message;
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
    return err.message;
  }
  return 'Social sign-in failed. Please try again.';
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: px(tokens.light['--cb-space-4']),
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: px(tokens.light['--cb-space-3']),
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: resolveToken('light', '--cb-color-border'),
  },
  dividerText: {
    marginHorizontal: px(tokens.light['--cb-space-2']),
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  button: {
    paddingVertical: px(tokens.light['--cb-space-3']),
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: px(tokens.light['--cb-space-2']),
  },
  appleButton: {
    backgroundColor: resolveToken('light', '--cb-color-text'),
  },
  googleButton: {
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    borderWidth: 1,
    borderColor: resolveToken('light', '--cb-color-border'),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
  },
  appleText: {
    color: resolveToken('light', '--cb-color-bg'),
  },
  googleText: {
    color: resolveToken('light', '--cb-color-text'),
  },
});
