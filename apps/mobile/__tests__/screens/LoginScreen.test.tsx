// LoginScreen smoke test — 컴포넌트가 정상 렌더 + 기본 elements 존재 + validation
// trigger 검증. 본격적 signIn → BFF → SecureStore 통합 흐름은 services/auth 의
// unit test (auth.test.ts) 에서 이미 검증.

jest.mock('aws-amplify/auth', () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  fetchAuthSession: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';

import { LoginScreen } from '../../src/screens/LoginScreen';

describe('LoginScreen', () => {
  it('타이틀 / 입력 필드 / 로그인 버튼을 렌더한다', () => {
    const onSuccess = jest.fn();
    render(<LoginScreen onSuccess={onSuccess} />);

    expect(screen.getByText('CelebBase 계정으로 계속')).toBeTruthy();
    expect(screen.getByLabelText('이메일')).toBeTruthy();
    expect(screen.getByLabelText('비밀번호')).toBeTruthy();
    expect(screen.getByLabelText('로그인')).toBeTruthy();
  });

  it('빈 이메일로 제출 시 validation 에러 메시지가 표시되고 onSuccess 는 호출되지 않는다', () => {
    const onSuccess = jest.fn();
    render(<LoginScreen onSuccess={onSuccess} />);

    fireEvent.press(screen.getByLabelText('로그인'));

    // Zod 가 첫 에러 (email invalid) 메시지를 노출
    expect(screen.getByText(/이메일/)).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('invalid email 입력 시 validation 에러를 표시한다', () => {
    const onSuccess = jest.fn();
    render(<LoginScreen onSuccess={onSuccess} />);

    fireEvent.changeText(screen.getByLabelText('이메일'), 'not-an-email');
    fireEvent.changeText(screen.getByLabelText('비밀번호'), 'pw');
    fireEvent.press(screen.getByLabelText('로그인'));

    expect(screen.getByText(/올바른 이메일/)).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
