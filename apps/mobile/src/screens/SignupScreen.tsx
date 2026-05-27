// 회원가입 화면 — two-step state ('form' → 'confirm').
//
//   step 'form':    email + password + display_name 입력 → signUp 호출
//                   → Cognito 이메일 코드 발송 → step='confirm' 으로 전환
//   step 'confirm': 6자리 코드 입력 → confirmSignUpAndLogin 호출
//                   → BFF /signup → SecureStore → onSuccess 콜백
//
// 디자인 시스템 primitive(Button/Text) + AuthCardLayout 카드. PasswordRequirements
// 가 카드 내 password input 바로 아래.

import { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';

import { AuthCardLayout } from '../components/AuthCardLayout';
import { FormErrorBox } from '../components/FormErrorBox';
import { FormField } from '../components/FormField';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { SocialAuthButtons } from '../components/SocialAuthButtons';
import { ApiError } from '../lib/api-client';
import { PasswordSchema, isPasswordValid } from '../lib/password-policy';
import { confirmSignUpAndLogin, signUp } from '../services/auth';
import { Button, Text, useTheme, type Theme } from '../ui';

// IMPL-MOBILE-SIGNUP-DISPLAYNAME-001: signup no longer collects a name. The
// server fills a neutral default; the user sets a real name during onboarding
// (the "What should we call you?" step persists it) or later in EditProfile.
const SignupFormSchema = z.object({
  email: z.string().email('Please enter a valid email address.').max(255),
  password: PasswordSchema,
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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [step, setStep] = useState<Step>('form');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignup(): Promise<void> {
    setError(null);
    const parsed = SignupFormSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await signUp({
        email: parsed.data.email,
        password: parsed.data.password,
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
          <Text variant="h2" accessibilityRole="header" center>
            Create account
          </Text>
          <Text variant="bodySm" tone="muted" center>
            Get started with CelebBase
          </Text>
        </View>

        <View style={styles.form}>
          <FormErrorBox message={error} />

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

          <View style={styles.submitWrap}>
            <Button
              label="Sign up"
              testID="signup-submit"
              loading={submitting}
              disabled={submitting || !passwordValid}
              onPress={() => {
                void handleSignup();
              }}
            />
          </View>

          <SocialAuthButtons
            disabled={submitting}
            onSuccess={onSuccess}
            onError={setError}
            onAccountDeleted={() => {
              // No restore panel on signup — route to Sign in, where restore lives.
              setError('This account is scheduled for deletion. Sign in to restore it.');
            }}
          />
        </View>

        <View style={styles.switchRow}>
          <Text variant="bodySm" tone="muted">
            Already have an account?{' '}
          </Text>
          <TouchableOpacity
            accessibilityLabel="Back to sign in"
            accessibilityRole="link"
            disabled={submitting}
            onPress={onBackToLogin}
          >
            <Text variant="bodySm" tone="brand" style={styles.linkBold}>
              Sign in
            </Text>
          </TouchableOpacity>
        </View>
      </AuthCardLayout>
    );
  }

  // step === 'confirm'
  return (
    <AuthCardLayout>
      <View style={styles.intro}>
        <Text variant="h2" accessibilityRole="header" center>
          Verify your email
        </Text>
        <Text variant="bodySm" tone="muted" center>
          Enter the 6-digit code sent to {email}.
        </Text>
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

        <View style={styles.submitWrap}>
          <Button
            label="Verify"
            accessibilityLabel="Verify code"
            loading={submitting}
            disabled={submitting}
            onPress={() => {
              void handleConfirm();
            }}
          />
        </View>
      </View>
    </AuthCardLayout>
  );
}

function mapErrorToMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'EMAIL_ALREADY_EXISTS':
        return 'This email is already registered. If you deleted this account, sign in to restore it.';
      case 'INVALID_CREDENTIALS':
        return 'The information you entered is invalid.';
      default:
        return err.message;
    }
  }
  if (err instanceof Error) {
    // IMPL-ACCOUNT-RESTORE-001: a deleted account keeps its Cognito identity, so
    // re-signup hits this. Point them to Sign in, where the restore path lives —
    // without disclosing whether the email is in a deleted state (no existence leak).
    if (err.name === 'UsernameExistsException') {
      return 'This email is already registered. If you deleted this account, sign in to restore it.';
    }
    if (err.name === 'InvalidPasswordException') {
      return 'Password must be at least 12 characters and include uppercase, lowercase, and a number.';
    }
    if (err.name === 'CodeMismatchException') return 'The code is incorrect.';
    if (err.name === 'ExpiredCodeException') return 'The code has expired. Please sign up again.';
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    intro: { gap: theme.space(2) },
    form: { gap: theme.space(3) },
    submitWrap: { marginTop: theme.space(2) },
    switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline' },
    linkBold: { fontWeight: theme.weight.semibold },
  });
}
