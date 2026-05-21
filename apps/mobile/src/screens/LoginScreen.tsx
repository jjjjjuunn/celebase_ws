// 로그인 화면 — email + password 입력 + signIn 호출.
//
// 디자인: 웹 `apps/web/src/app/(auth)/login/page.tsx` 의 카드 + label-above-input
// + 시각적 에러 박스 패턴 적용. AuthCardLayout 으로 중앙 카드 + 브랜드 상단.
//
// validation: Zod inline (RHF 의존성 추가 회피 — 2 필드 폼에 oversized).

import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';

import { tokens } from '@celebbase/design-tokens';

import { AuthCardLayout } from '../components/AuthCardLayout';
import { FormErrorBox } from '../components/FormErrorBox';
import { FormField } from '../components/FormField';
import { ApiError } from '../lib/api-client';
import { signIn } from '../services/auth';
import { SocialAuthButtons } from '../components/SocialAuthButtons';
import { px, resolveToken } from '../lib/tokens';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(): Promise<void> {
    setError(null);

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
      setError(mapErrorToMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCardLayout>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.title}>
          Welcome back
        </Text>
        <Text style={styles.subtitle}>Sign in to continue to CelebBase</Text>
      </View>

      <View style={styles.form}>
        <FormErrorBox message={error} />

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
          <Text style={styles.forgotLinkText}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityLabel="Sign in"
          testID="login-submit"
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting }}
          disabled={submitting}
          onPress={() => {
            void handleSubmit();
          }}
          style={[styles.submit, submitting && styles.submitDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color={resolveToken('light', '--cb-cta-text')} />
          ) : (
            <Text style={styles.submitText}>Sign in</Text>
          )}
        </TouchableOpacity>

        <SocialAuthButtons disabled={submitting} onSuccess={onSuccess} onError={setError} />
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchText}>Don't have an account? </Text>
        <TouchableOpacity
          accessibilityLabel="Create account"
          testID="login-signup-link"
          accessibilityRole="link"
          disabled={submitting}
          onPress={onSignupRequest}
        >
          <Text style={styles.switchLink}>Sign up</Text>
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

const styles = StyleSheet.create({
  intro: {
    gap: px(tokens.light['--cb-space-2']),
  },
  title: {
    fontSize: px(tokens.light['--cb-font-size-xl']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text'),
    textAlign: 'center',
  },
  subtitle: {
    fontSize: px(tokens.light['--cb-font-size-sm']),
    color: resolveToken('light', '--cb-color-text-muted'),
    textAlign: 'center',
  },
  form: {
    gap: px(tokens.light['--cb-space-3']),
  },
  forgotLink: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
  },
  forgotLinkText: {
    color: resolveToken('light', '--cb-color-brand'),
    fontSize: px(tokens.light['--cb-font-size-sm']),
    fontWeight: '600',
  },
  submit: {
    paddingVertical: px(tokens.light['--cb-space-3']),
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
    borderRadius: px(tokens.light['--cb-radius-md']),
    alignItems: 'center',
    marginTop: px(tokens.light['--cb-space-2']),
  },
  submitDisabled: {
    opacity: 0.55,
  },
  submitText: {
    color: resolveToken('light', '--cb-cta-text'),
    fontSize: px(tokens.light['--cb-font-size-md']),
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
  },
  switchText: {
    fontSize: px(tokens.light['--cb-font-size-sm']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  switchLink: {
    fontSize: px(tokens.light['--cb-font-size-sm']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-brand'),
  },
});
