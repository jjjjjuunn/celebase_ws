// 로그인 화면 — email + password 입력 + signIn 호출.
// 디자인 시스템 primitive(Button/Text) + AuthCardLayout 카드. validation: Zod inline
// (RHF 의존성 추가 회피 — 2 필드 폼에 oversized).

import { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';

import { AuthCardLayout } from '../components/AuthCardLayout';
import { FormErrorBox } from '../components/FormErrorBox';
import { FormField } from '../components/FormField';
import { SocialAuthButtons } from '../components/SocialAuthButtons';
import { ApiError } from '../lib/api-client';
import { AccountDeletedError } from '../lib/auth-errors';
import { restoreAccount } from '../lib/restore';
import { signIn } from '../services/auth';
import { Button, Text, useTheme, type Theme } from '../ui';

const LoginFormSchema = z.object({
  email: z.string().email('Please enter a valid email address.').max(255),
  password: z.string().min(1, 'Please enter your password.'),
});

interface LoginScreenProps {
  /** 로그인 성공 시 호출 — 호출자가 화면 전환 처리. */
  onSuccess: () => void;
  /** "계정 만들기" 링크 탭 시 호출 — 호출자가 SignupScreen 으로 전환. */
  onSignupRequest: () => void;
  /** "비밀번호 찾기" 링크 탭 시 호출 — 호출자가 ForgotPasswordScreen 으로 전환. */
  onForgotPasswordRequest: () => void;
}

export function LoginScreen({
  onSuccess,
  onSignupRequest,
  onForgotPasswordRequest,
}: LoginScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // IMPL-ACCOUNT-RESTORE-001: set when login hits a soft-deleted account; renders
  // the restore affordance and carries the verified id_token for the restore call.
  const [restoreCtx, setRestoreCtx] = useState<AccountDeletedError | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function handleSubmit(): Promise<void> {
    setError(null);
    setRestoreCtx(null);

    const parsed = LoginFormSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSubmitting(true);
    try {
      await signIn({ email: parsed.data.email, password: parsed.data.password });
      onSuccess();
    } catch (err) {
      // Soft-deleted account → offer in-place restore instead of a dead-end error.
      if (err instanceof AccountDeletedError) {
        setRestoreCtx(err);
      } else {
        setError(mapErrorToMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestore(): Promise<void> {
    if (restoreCtx === null) return;
    setRestoring(true);
    try {
      await restoreAccount(restoreCtx.idToken, restoreCtx.provider);
      onSuccess();
    } catch (err) {
      // Restore failed (e.g. NOT_FOUND if a hard-delete raced, RATE_LIMITED, or an
      // expired id_token). Dismiss the panel and surface the message — codes not in
      // mapErrorToMessage fall through to err.message by design (no per-code mapping
      // for these edge failures; the user can re-tap Sign in to retry).
      setRestoreCtx(null);
      setError(mapErrorToMessage(err));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <AuthCardLayout>
      <View style={styles.intro}>
        <Text variant="h2" accessibilityRole="header" center>
          Welcome back
        </Text>
        <Text variant="bodySm" tone="muted" center>
          Sign in to continue to CelebBase
        </Text>
      </View>

      <View style={styles.form}>
        {restoreCtx !== null ? (
          <View style={styles.restorePanel} testID="login-restore-panel">
            <Text variant="bodySm">
              This account is scheduled for deletion. Restore it to sign back in.
            </Text>
            <Button
              label="Restore account"
              testID="login-restore-submit"
              loading={restoring}
              disabled={restoring}
              onPress={() => {
                void handleRestore();
              }}
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Cancel restore"
              disabled={restoring}
              onPress={() => {
                setRestoreCtx(null);
              }}
            >
              <Text variant="bodySm" tone="muted" center>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FormErrorBox message={error} />
        )}

        <FormField
          id="login-email"
          label="Email"
          testID="login-email"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          editable={!submitting}
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="you@example.com"
          textContentType="emailAddress"
          value={email}
        />

        <FormField
          id="login-password"
          label="Password"
          testID="login-password"
          autoCapitalize="none"
          autoComplete="password"
          autoCorrect={false}
          editable={!submitting}
          onChangeText={setPassword}
          placeholder=""
          secureTextEntry
          textContentType="password"
          value={password}
        />

        <TouchableOpacity
          accessibilityLabel="Forgot password"
          testID="login-forgot-link"
          accessibilityRole="link"
          disabled={submitting}
          onPress={onForgotPasswordRequest}
          style={styles.forgotLink}
        >
          <Text variant="bodySm" tone="brand" style={styles.linkBold}>
            Forgot password?
          </Text>
        </TouchableOpacity>

        <View style={styles.submitWrap}>
          <Button
            label="Sign in"
            testID="login-submit"
            loading={submitting}
            disabled={submitting}
            onPress={() => {
              void handleSubmit();
            }}
          />
        </View>

        <SocialAuthButtons
          disabled={submitting}
          onSuccess={onSuccess}
          onError={setError}
          onAccountDeleted={setRestoreCtx}
        />
      </View>

      <View style={styles.switchRow}>
        <Text variant="bodySm" tone="muted">
          Don&apos;t have an account?{' '}
        </Text>
        <TouchableOpacity
          accessibilityLabel="Create account"
          testID="login-signup-link"
          accessibilityRole="link"
          disabled={submitting}
          onPress={onSignupRequest}
        >
          <Text variant="bodySm" tone="brand" style={styles.linkBold}>
            Sign up
          </Text>
        </TouchableOpacity>
      </View>
    </AuthCardLayout>
  );
}

function mapErrorToMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'INVALID_CREDENTIALS':
        return 'Incorrect email or password.';
      case 'ACCOUNT_DELETED':
        return 'This account has been deleted.';
      case 'RATE_LIMITED':
        return 'Too many attempts. Please try again later.';
      default:
        return err.message;
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    intro: { gap: theme.space(2) },
    form: { gap: theme.space(3) },
    forgotLink: { alignSelf: 'flex-end', paddingVertical: 2 },
    restorePanel: {
      gap: theme.space(2),
      padding: theme.space(3),
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    submitWrap: { marginTop: theme.space(2) },
    switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline' },
    linkBold: { fontWeight: theme.weight.semibold },
  });
}
