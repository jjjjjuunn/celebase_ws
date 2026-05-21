// 회원가입 화면 — two-step state ('form' → 'confirm').
//
//   step 'form':    email + password + display_name 입력 → signUp 호출
//                   → Cognito 이메일 코드 발송 → step='confirm' 으로 전환
//   step 'confirm': 6자리 코드 입력 → confirmSignUpAndLogin 호출
//                   → BFF /signup → SecureStore → onSuccess 콜백
//
// 디자인: 웹 `apps/web/src/app/(auth)/signup/page.tsx` 의 카드 + label 위 input
// 패턴 적용. PasswordRequirements 가 카드 내 password input 바로 아래.

import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';

import { tokens } from '@celebbase/design-tokens';

import { AuthCardLayout } from '../components/AuthCardLayout';
import { FormErrorBox } from '../components/FormErrorBox';
import { FormField } from '../components/FormField';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { ApiError } from '../lib/api-client';
import { PasswordSchema, isPasswordValid } from '../lib/password-policy';
import { confirmSignUpAndLogin, signUp } from '../services/auth';
import { SocialAuthButtons } from '../components/SocialAuthButtons';
import { px, resolveToken } from '../lib/tokens';

const SignupFormSchema = z.object({
  email: z.string().email('Please enter a valid email address.').max(255),
  password: PasswordSchema,
  display_name: z.string().min(1, 'Please enter your name.').max(100),
});

const ConfirmFormSchema = z.object({
  code: z.string().min(6, 'Please enter the 6-digit code.').max(6),
});

interface SignupScreenProps {
  /** 회원가입 완료 시 호출 — 호출자가 home 화면으로 전환. */
  onSuccess: () => void;
  /** "로그인으로 돌아가기" 시 호출. */
  onBackToLogin: () => void;
}

type Step = 'form' | 'confirm';

export function SignupScreen({ onSuccess, onBackToLogin }: SignupScreenProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('form');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignup(): Promise<void> {
    setError(null);
    const parsed = SignupFormSchema.safeParse({ email, password, display_name: displayName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        display_name: parsed.data.display_name,
      });
      if (result.nextStep === 'DONE') {
        // Cognito 가 자동 가입 — 별도 confirmation 불필요. 바로 confirmSignUpAndLogin
        // 으로 BFF /signup 호출 (코드는 무시 — Cognito 가 통과시킬 것).
        await runConfirm('');
      } else {
        setStep('confirm');
      }
    } catch (err) {
      setError(mapErrorToMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function runConfirm(confirmationCode: string): Promise<void> {
    await confirmSignUpAndLogin({
      email,
      code: confirmationCode,
      password,
      display_name: displayName,
    });
    onSuccess();
  }

  async function handleConfirm(): Promise<void> {
    setError(null);
    const parsed = ConfirmFormSchema.safeParse({ code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the code.');
      return;
    }
    setSubmitting(true);
    try {
      await runConfirm(parsed.data.code);
    } catch (err) {
      setError(mapErrorToMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'form') {
    const passwordValid = isPasswordValid(password);
    return (
      <AuthCardLayout>
        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>
            Create account
          </Text>
          <Text style={styles.subtitle}>Get started with CelebBase</Text>
        </View>

        <View style={styles.form}>
          <FormErrorBox message={error} />

          <FormField
            id="signup-name"
            label="Display name"
            autoCapitalize="words"
            editable={!submitting}
            onChangeText={setDisplayName}
            placeholder="Your name"
            textContentType="name"
            value={displayName}
          />

          <FormField
            id="signup-email"
            label="Email"
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
            id="signup-password"
            label="Password"
            autoCapitalize="none"
            autoComplete="password-new"
            autoCorrect={false}
            editable={!submitting}
            onChangeText={setPassword}
            placeholder=""
            secureTextEntry
            textContentType="newPassword"
            value={password}
          />

          <PasswordRequirements password={password} />

          <TouchableOpacity
            accessibilityLabel="Sign up"
            testID="signup-submit"
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting || !passwordValid }}
            disabled={submitting || !passwordValid}
            onPress={() => {
              void handleSignup();
            }}
            style={[
              styles.submit,
              (submitting || !passwordValid) && styles.submitDisabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={resolveToken('light', '--cb-cta-text')} />
            ) : (
              <Text style={styles.submitText}>Sign up</Text>
            )}
          </TouchableOpacity>

          <SocialAuthButtons disabled={submitting} onSuccess={onSuccess} onError={setError} />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Already have an account? </Text>
          <TouchableOpacity
            accessibilityLabel="Back to sign in"
            accessibilityRole="link"
            disabled={submitting}
            onPress={onBackToLogin}
          >
            <Text style={styles.switchLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </AuthCardLayout>
    );
  }

  // step === 'confirm'
  return (
    <AuthCardLayout>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.title}>
          Verify your email
        </Text>
        <Text style={styles.subtitle}>Enter the 6-digit code sent to {email}.</Text>
      </View>

      <View style={styles.form}>
        <FormErrorBox message={error} />

        <FormField
          id="signup-code"
          label="Verification code"
          autoCapitalize="none"
          editable={!submitting}
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={setCode}
          placeholder="123456"
          textContentType="oneTimeCode"
          value={code}
        />

        <TouchableOpacity
          accessibilityLabel="Verify code"
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting }}
          disabled={submitting}
          onPress={() => {
            void handleConfirm();
          }}
          style={[styles.submit, submitting && styles.submitDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color={resolveToken('light', '--cb-cta-text')} />
          ) : (
            <Text style={styles.submitText}>Verify</Text>
          )}
        </TouchableOpacity>
      </View>
    </AuthCardLayout>
  );
}

function mapErrorToMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'EMAIL_ALREADY_EXISTS':
        return 'This email is already registered.';
      case 'INVALID_CREDENTIALS':
        return 'The information you entered is invalid.';
      default:
        return err.message;
    }
  }
  if (err instanceof Error) {
    if (err.name === 'UsernameExistsException') return 'This email is already registered.';
    if (err.name === 'InvalidPasswordException') {
      return 'Password must be at least 12 characters and include uppercase, lowercase, and a number.';
    }
    if (err.name === 'CodeMismatchException') return 'The code is incorrect.';
    if (err.name === 'ExpiredCodeException') return 'The code has expired. Please sign up again.';
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
