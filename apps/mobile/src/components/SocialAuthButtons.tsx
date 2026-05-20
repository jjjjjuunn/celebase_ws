// Social sign-in buttons (Google / Apple) — IMPL-MOBILE-SOCIAL-001.
//
// Rendered on Login + Signup screens. Returns null unless social federation is
// configured (EXPO_PUBLIC_COGNITO_HOSTED_UI_DOMAIN + EXPO_PUBLIC_SOCIAL_PROVIDERS),
// so the screens look exactly as before when social login is not set up — the
// feature ships dormant until the env is populated (runs anywhere).
//
// Apple is listed first per App Store HIG ("Sign in with Apple" prominence).
// Text-only buttons (no provider glyphs) — adding logo assets is a polish
// follow-up; Hosted-UI federation does not require the native provider button.

import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { tokens } from '@celebbase/design-tokens';

import { ApiError } from '../lib/api-client';
import { isSocialAuthEnabled, readSocialProviders, type SocialProvider } from '../lib/social-config';
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

  if (!isSocialAuthEnabled()) return null;

  const configured = readSocialProviders();
  const providers = PROVIDER_ORDER.filter((p) => configured.includes(p));
  if (providers.length === 0) return null;

  async function handlePress(provider: SocialProvider): Promise<void> {
    onError('');
    setPending(provider);
    try {
      // Lazy-import so this screen's module-load never pulls the aws-amplify
      // barrel (RN .ts source is outside jest's transform scope). The button is
      // only ever pressed on-device where the native modules are present.
      const { signInWithSocial } = await import('../services/social-auth');
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
    // ASWebAuthenticationSession / Custom Tabs dismissal → not an error.
    if (/cancel/i.test(err.name) || /cancel/i.test(err.message)) return null;
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
