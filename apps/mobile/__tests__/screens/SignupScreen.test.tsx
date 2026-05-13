// SignupScreen smoke — 컴포넌트 렌더 + 기본 elements + step 전환 trigger 검증.

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

describe('SignupScreen', () => {
  it('form step: 타이틀 + 이메일/이름/비밀번호 input + 가입 버튼을 렌더한다', () => {
    const onSuccess = jest.fn();
    const onBackToLogin = jest.fn();
    render(<SignupScreen onSuccess={onSuccess} onBackToLogin={onBackToLogin} />);

    expect(screen.getByText('Get started with CelebBase')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByLabelText('Sign up')).toBeTruthy();
    expect(screen.getByLabelText('Back to sign in')).toBeTruthy();
  });

  it('빈 폼 제출 시 validation 에러 표시, onSuccess 미호출', () => {
    const onSuccess = jest.fn();
    const onBackToLogin = jest.fn();
    render(<SignupScreen onSuccess={onSuccess} onBackToLogin={onBackToLogin} />);

    fireEvent.press(screen.getByLabelText('Sign up'));

    expect(screen.getByText(/email|name|password/i)).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('비밀번호 < 8자 → validation 에러', () => {
    const onSuccess = jest.fn();
    const onBackToLogin = jest.fn();
    render(<SignupScreen onSuccess={onSuccess} onBackToLogin={onBackToLogin} />);

    fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
    fireEvent.changeText(screen.getByLabelText('Name'), 'Alice');
    fireEvent.changeText(screen.getByLabelText('Password'), 'short');
    fireEvent.press(screen.getByLabelText('Sign up'));

    expect(screen.getByText(/at least 8/i)).toBeTruthy();
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
