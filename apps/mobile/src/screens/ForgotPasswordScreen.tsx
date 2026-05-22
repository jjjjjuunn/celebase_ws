// 비밀번호 찾기 — two-step state ('request' → 'confirm' → 성공 시 Login 복귀).
//
//   step 'request': email 입력 → requestPasswordReset → 이메일로 코드 발송
//                   → step='confirm' 으로 전환
//   step 'confirm': 6자리 코드 + 새 비밀번호 입력 (실시간 정책 검증)
//                   → confirmPasswordReset → onSuccess() (Login 화면 복귀)
//
// 보안: requestPasswordReset 의 UserNotFoundException 은 사용자에게 직접 노출
// 하지 않는다 (user enumeration 회피) — generic "If an account exists, a code
// has been sent" 로 처리하고 step 을 무조건 'confirm' 으로 전환.
//
// 디자인 시스템 primitive(Button/Text) + AuthCardLayout 카드 (Login/Signup 과 동등).

import { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';

import { AuthCardLayout } from '../components/AuthCardLayout';
import { FormErrorBox } from '../components/FormErrorBox';
import { FormField } from '../components/FormField';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { PasswordSchema, isPasswordValid } from '../lib/password-policy';
import { confirmPasswordReset, requestPasswordReset } from '../services/auth';
import { Button, Text, useTheme, type Theme } from '../ui';

const RequestSchema = z.object({
  email: z.string().email('Please enter a valid email address.').max(255),
});

const ConfirmSchema = z.object({
  code: z.string().min(6, 'Please enter the 6-digit code.').max(6),
  newPassword: PasswordSchema,
});

interface ForgotPasswordScreenProps {
  /** 재설정 완료 시 호출 — 호출자가 Login 화면으로 복귀 처리. */
  onSuccess: () => void;
  /** 사용자가 명시적으로 Login 복귀를 선택할 때. */
  onBackToLogin: () => void;
}

type Step = 'request' | 'confirm' | 'done';

export function ForgotPasswordScreen({
  onSuccess,
  onBackToLogin,
}: ForgotPasswordScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRequest(): Promise<void> {
    setError(null);
    setInfo(null);
    const parsed = RequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(parsed.data.email);
    } catch (err) {
      if (err instanceof Error && err.name === 'LimitExceededException') {
        setError('Too many attempts. Please try again later.');
        setSubmitting(false);
        return;
      }
      // 기타 에러 (UserNotFoundException 포함) silent — user enumeration 회피.
    }
    setSubmitting(false);
    setInfo('If an account exists for this email, a verification code has been sent.');
    setStep('confirm');
  }

  async function handleConfirm(): Promise<void> {
    setError(null);
    setInfo(null);
    const parsed = ConfirmSchema.safeParse({ code, newPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset({
        email,
        code: parsed.data.code,
        newPassword: parsed.data.newPassword,
      });
      setStep('done');
      setTimeout(() => {
        onSuccess();
      }, 800);
    } catch (err) {
      setError(mapErrorToMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'done') {
    return (
      <AuthCardLayout>
        <View style={styles.intro}>
          <Text variant="h2" accessibilityRole="header" center>
            Password updated
          </Text>
          <Text variant="bodySm" tone="muted" center>
            Sign in with your new password.
          </Text>
        </View>
      </AuthCardLayout>
    );
  }

  if (step === 'request') {
    return (
      <AuthCardLayout>
        <View style={styles.intro}>
          <Text variant="h2" accessibilityRole="header" center>
            Reset your password
          </Text>
          <Text variant="bodySm" tone="muted" center>
            Enter the email associated with your account. We&apos;ll send a verification code.
          </Text>
        </View>

        <View style={styles.form}>
          <FormErrorBox message={error} />

          <FormField
            id="forgot-email"
            label="Email"
            testID="forgot-email"
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

          <View style={styles.submitWrap}>
            <Button
              label="Send code"
              accessibilityLabel="Send verification code"
              testID="forgot-send-code"
              loading={submitting}
              disabled={submitting}
              onPress={() => {
                void handleRequest();
              }}
            />
          </View>
        </View>

        <View style={styles.switchRowCenter}>
          <TouchableOpacity
            accessibilityLabel="Back to sign in"
            accessibilityRole="link"
            disabled={submitting}
            onPress={onBackToLogin}
          >
            <Text variant="bodySm" tone="brand" style={styles.linkBold}>
              Back to sign in
            </Text>
          </TouchableOpacity>
        </View>
      </AuthCardLayout>
    );
  }

  // step === 'confirm'
  const passwordValid = isPasswordValid(newPassword);
  return (
    <AuthCardLayout>
      <View style={styles.intro}>
        <Text variant="h2" accessibilityRole="header" center>
          Enter the code
        </Text>
        <Text variant="bodySm" tone="muted" center>
          Enter the 6-digit code sent to {email} and choose a new password.
        </Text>
      </View>

      <View style={styles.form}>
        {info !== null ? (
          <Text variant="bodySm" tone="muted" center>
            {info}
          </Text>
        ) : null}

        <FormErrorBox message={error} />

        <FormField
          id="forgot-code"
          label="Verification code"
          testID="forgot-code"
          autoCapitalize="none"
          editable={!submitting}
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={setCode}
          placeholder="123456"
          textContentType="oneTimeCode"
          value={code}
        />

        <FormField
          id="forgot-new-password"
          label="New password"
          testID="forgot-new-password"
          autoCapitalize="none"
          autoComplete="password-new"
          autoCorrect={false}
          editable={!submitting}
          onChangeText={setNewPassword}
          placeholder=""
          secureTextEntry
          textContentType="newPassword"
          value={newPassword}
        />

        <PasswordRequirements password={newPassword} />

        <View style={styles.submitWrap}>
          <Button
            label="Reset password"
            testID="forgot-confirm"
            loading={submitting}
            disabled={submitting || !passwordValid}
            onPress={() => {
              void handleConfirm();
            }}
          />
        </View>
      </View>

      <View style={styles.switchRowCenter}>
        <TouchableOpacity
          accessibilityLabel="Back to sign in"
          accessibilityRole="link"
          disabled={submitting}
          onPress={onBackToLogin}
        >
          <Text variant="bodySm" tone="brand" style={styles.linkBold}>
            Back to sign in
          </Text>
        </TouchableOpacity>
      </View>
    </AuthCardLayout>
  );
}

function mapErrorToMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'CodeMismatchException') return 'The code is incorrect.';
    if (err.name === 'ExpiredCodeException') {
      return 'The code has expired. Please request a new one.';
    }
    if (err.name === 'InvalidPasswordException') {
      return 'Password must be at least 12 characters and include uppercase, lowercase, and a number.';
    }
    if (err.name === 'LimitExceededException') {
      return 'Too many attempts. Please try again later.';
    }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    intro: { gap: theme.space(2) },
    form: { gap: theme.space(3) },
    submitWrap: { marginTop: theme.space(2) },
    switchRowCenter: { flexDirection: 'row', justifyContent: 'center' },
    linkBold: { fontWeight: theme.weight.semibold },
  });
}
