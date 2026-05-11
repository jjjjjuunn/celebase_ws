// 회원가입 화면 — two-step state ('form' → 'confirm').
//
//   step 'form':    email + password + display_name 입력 → signUp 호출
//                   → Cognito 이메일 코드 발송 → step='confirm' 으로 전환
//   step 'confirm': 6자리 코드 입력 → confirmSignUpAndLogin 호출
//                   → BFF /signup → SecureStore → onSuccess 콜백
//
// password 는 step 1 에서 보관 후 step 2 에서 signIn 에 재사용 (Cognito 흐름상
// confirmation 후 별도 로그인 필요).

import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';

import { tokens } from '@celebbase/design-tokens';

import { ApiError } from '../lib/api-client';
import { confirmSignUpAndLogin, signUp } from '../services/auth';
import { px, resolveToken } from '../lib/tokens';

const SignupFormSchema = z.object({
  email: z.string().email('올바른 이메일 주소를 입력하세요.').max(255),
  password: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다.'),
  display_name: z.string().min(1, '이름을 입력하세요.').max(100),
});

const ConfirmFormSchema = z.object({
  code: z.string().min(6, '6자리 코드를 입력하세요.').max(6),
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

  // form step
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // confirm step
  const [code, setCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignup(): Promise<void> {
    setError(null);
    const parsed = SignupFormSchema.safeParse({ email, password, display_name: displayName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인하세요.');
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
        // Cognito 가 자동 가입 — 별도 confirmation 불필요. 바로 confirmSignUpAndLogin 으로
        // BFF /signup 호출 (코드는 무시 — Cognito 가 통과시킬 것).
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
      setError(parsed.error.issues[0]?.message ?? '코드를 확인하세요.');
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
    return (
      <View style={styles.container}>
        <Text style={styles.title}>회원가입</Text>
        <Text style={styles.subtitle}>CelebBase 시작하기</Text>

        <TextInput
          accessibilityLabel="이메일"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          editable={!submitting}
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="이메일"
          placeholderTextColor={resolveToken('light', '--cb-color-text-muted')}
          style={styles.input}
          textContentType="emailAddress"
          value={email}
        />
        <TextInput
          accessibilityLabel="이름"
          autoCapitalize="words"
          editable={!submitting}
          onChangeText={setDisplayName}
          placeholder="이름"
          placeholderTextColor={resolveToken('light', '--cb-color-text-muted')}
          style={styles.input}
          textContentType="name"
          value={displayName}
        />
        <TextInput
          accessibilityLabel="비밀번호"
          autoCapitalize="none"
          autoComplete="password-new"
          autoCorrect={false}
          editable={!submitting}
          onChangeText={setPassword}
          placeholder="비밀번호 (8자 이상)"
          placeholderTextColor={resolveToken('light', '--cb-color-text-muted')}
          secureTextEntry
          style={styles.input}
          textContentType="newPassword"
          value={password}
        />

        {error !== null && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}

        <TouchableOpacity
          accessibilityLabel="가입하기"
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting }}
          disabled={submitting}
          onPress={() => {
            void handleSignup();
          }}
          style={[styles.button, submitting && styles.buttonDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color={resolveToken('light', '--cb-color-bg')} />
          ) : (
            <Text style={styles.buttonText}>가입하기</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityLabel="로그인으로 돌아가기"
          accessibilityRole="link"
          disabled={submitting}
          onPress={onBackToLogin}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>이미 계정이 있으신가요? 로그인</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // step === 'confirm'
  return (
    <View style={styles.container}>
      <Text style={styles.title}>이메일 확인</Text>
      <Text style={styles.subtitle}>
        {email} 으로 발송된 6자리 코드를 입력하세요.
      </Text>

      <TextInput
        accessibilityLabel="인증 코드"
        autoCapitalize="none"
        editable={!submitting}
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={setCode}
        placeholder="123456"
        placeholderTextColor={resolveToken('light', '--cb-color-text-muted')}
        style={styles.input}
        textContentType="oneTimeCode"
        value={code}
      />

      {error !== null && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      <TouchableOpacity
        accessibilityLabel="코드 확인"
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting }}
        disabled={submitting}
        onPress={() => {
          void handleConfirm();
        }}
        style={[styles.button, submitting && styles.buttonDisabled]}
      >
        {submitting ? (
          <ActivityIndicator color={resolveToken('light', '--cb-color-bg')} />
        ) : (
          <Text style={styles.buttonText}>확인</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function mapErrorToMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'EMAIL_ALREADY_EXISTS':
        return '이미 가입된 이메일입니다.';
      case 'INVALID_CREDENTIALS':
        return '입력값이 올바르지 않습니다.';
      default:
        return err.message;
    }
  }
  if (err instanceof Error) {
    // Cognito 표준 에러 — `err.name` 으로 분기
    if (err.name === 'UsernameExistsException') return '이미 가입된 이메일입니다.';
    if (err.name === 'InvalidPasswordException') {
      return '비밀번호는 대문자/소문자/숫자/특수문자를 포함해야 합니다.';
    }
    if (err.name === 'CodeMismatchException') return '코드가 일치하지 않습니다.';
    if (err.name === 'ExpiredCodeException') return '코드가 만료되었습니다. 다시 가입해주세요.';
    return err.message;
  }
  return '알 수 없는 오류가 발생했습니다.';
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
