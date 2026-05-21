// SignupScreen smoke — 컴포넌트 렌더 + 기본 elements + validation/gate 동작 검증.
// 새 폼 UI: Display name / Email / Password 필드 + PasswordRequirements + Sign up
// 버튼은 비밀번호 정책(12자+대/소문자+숫자) 미달 시 disabled (서버 round-trip 전 차단).

jest.mock('aws-amplify/auth', () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  signUp: jest.fn(),
  confirmSignUp: jest.fn(),
  fetchAuthSession: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';

import { SignupScreen } from '../../src/screens/SignupScreen';

// 비밀번호 정책 충족 샘플 (12자 + 대문자 + 소문자 + 숫자).
const VALID_PASSWORD = 'Password1234';

describe('SignupScreen', () => {
  it('form step: 타이틀 + 이름/이메일/비밀번호 input + 가입 버튼을 렌더한다', () => {
    const onSuccess = jest.fn();
    const onBackToLogin = jest.fn();
    render(<SignupScreen onSuccess={onSuccess} onBackToLogin={onBackToLogin} />);

    expect(screen.getByText('Create account')).toBeTruthy();
    expect(screen.getByText('Get started with CelebBase')).toBeTruthy();
    expect(screen.getByLabelText('Display name')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByLabelText('Sign up')).toBeTruthy();
    expect(screen.getByLabelText('Back to sign in')).toBeTruthy();
  });

  it('비밀번호 정책 미달 시 Sign up 버튼이 비활성화되어 onSuccess 미호출', () => {
    const onSuccess = jest.fn();
    const onBackToLogin = jest.fn();
    render(<SignupScreen onSuccess={onSuccess} onBackToLogin={onBackToLogin} />);

    fireEvent.changeText(screen.getByLabelText('Display name'), 'Alice');
    fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
    fireEvent.changeText(screen.getByLabelText('Password'), 'short');

    const submit = screen.getByLabelText('Sign up');
    // 정책 미달 → 버튼 disabled → press 해도 onSuccess 미호출.
    expect(submit.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(submit);
    expect(onSuccess).not.toHaveBeenCalled();
    // PasswordRequirements 가 미충족 규칙을 노출.
    expect(screen.getByText('At least 12 characters')).toBeTruthy();
  });

  it('유효 비밀번호 + invalid email 제출 시 email validation 에러, onSuccess 미호출', () => {
    const onSuccess = jest.fn();
    const onBackToLogin = jest.fn();
    render(<SignupScreen onSuccess={onSuccess} onBackToLogin={onBackToLogin} />);

    fireEvent.changeText(screen.getByLabelText('Display name'), 'Alice');
    fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');
    fireEvent.changeText(screen.getByLabelText('Password'), VALID_PASSWORD);
    fireEvent.press(screen.getByLabelText('Sign up'));

    expect(screen.getByText(/valid email/i)).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('"로그인으로 돌아가기" 탭 시 onBackToLogin 호출', () => {
    const onSuccess = jest.fn();
    const onBackToLogin = jest.fn();
    render(<SignupScreen onSuccess={onSuccess} onBackToLogin={onBackToLogin} />);

    fireEvent.press(screen.getByLabelText('Back to sign in'));
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
  });
});
