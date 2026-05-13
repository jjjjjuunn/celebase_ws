// 로그인 화면 — email + password 입력 + signIn 호출.
//
// M1 의 사용자 가시 진입점. 회원가입 (signUp + confirmSignUp) 흐름은 M1-F backlog
// 로 분리 — Cognito confirmation 코드 입력 단계 + resend 등이 UI 복잡도 증가.
//
// validation: Zod inline (RHF 의존성 추가 회피 — 2 필드 폼에 oversized).
// error 표면화: signIn 의 ApiError.code (BFF envelope code) 와 일반 Error 모두 처리.

import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { tokens } from '@celebbase/design-tokens';

import { ApiError } from '../lib/api-client';
import { signIn } from '../services/auth';
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
}

export function LoginScreen({ onSuccess, onSignupRequest }: LoginScreenProps): React.JSX.Element {
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
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to continue to CelebBase</Text>

      <TextInput
        accessibilityLabel="Email"
        testID="login-email"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        editable={!submitting}
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={resolveToken('light', '--cb-color-text-muted')}
        style={styles.input}
        textContentType="emailAddress"
        value={email}
      />

      <TextInput
        accessibilityLabel="Password"
        testID="login-password"
        autoCapitalize="none"
        autoComplete="password"
        autoCorrect={false}
        editable={!submitting}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={resolveToken('light', '--cb-color-text-muted')}
        secureTextEntry
        style={styles.input}
        textContentType="password"
        value={password}
      />

      {error !== null && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      <TouchableOpacity
        accessibilityLabel="Sign in"
        testID="login-submit"
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting }}
        disabled={submitting}
        onPress={() => {
          void handleSubmit();
        }}
        style={[styles.button, submitting && styles.buttonDisabled]}
      >
        {submitting ? (
          <ActivityIndicator color={resolveToken('light', '--cb-color-bg')} />
        ) : (
          <Text style={styles.buttonText}>Sign in</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityLabel="Create account"
        testID="login-signup-link"
        accessibilityRole="link"
        disabled={submitting}
        onPress={onSignupRequest}
        style={styles.linkButton}
      >
        <Text style={styles.linkText}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function mapErrorToMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // BFF envelope code 별 사용자 친화 메시지. 5종 enum 외 케이스는 일반 메시지.
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
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: resolveToken('light', '--cb-color-bg'),
    paddingHorizontal: px(tokens.light['--cb-space-4']),
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-brand'),
    marginBottom: px(tokens.light['--cb-space-2']),
    textAlign: 'center',
  },
  subtitle: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
    marginBottom: px(tokens.light['--cb-space-5']),
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: resolveToken('light', '--cb-color-border'),
    borderRadius: 8,
    paddingHorizontal: px(tokens.light['--cb-space-3']),
    paddingVertical: px(tokens.light['--cb-space-3']),
    marginBottom: px(tokens.light['--cb-space-3']),
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text'),
    backgroundColor: resolveToken('light', '--cb-color-surface'),
  },
  error: {
    color: resolveToken('light', '--cb-color-error'),
    fontSize: px(tokens.light['--cb-body-sm']),
    marginBottom: px(tokens.light['--cb-space-3']),
    textAlign: 'center',
  },
  button: {
    backgroundColor: resolveToken('light', '--cb-color-brand'),
    paddingVertical: px(tokens.light['--cb-space-3']),
    borderRadius: 8,
    alignItems: 'center',
    marginTop: px(tokens.light['--cb-space-2']),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: resolveToken('light', '--cb-color-bg'),
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
  },
  linkButton: {
    marginTop: px(tokens.light['--cb-space-3']),
    alignItems: 'center',
  },
  linkText: {
    color: resolveToken('light', '--cb-color-brand'),
    fontSize: px(tokens.light['--cb-body-sm']),
  },
});
