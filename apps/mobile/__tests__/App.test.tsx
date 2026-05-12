// App 은 module-load 시점에 configureCognito() 를 호출하므로 aws-amplify 가
// jest transform 범위 밖 (.ts RN export) 인 점을 우회하려면 jest.mock 으로
// 모듈 자체를 차단해야 한다. env 셋업은 `jest.setup.js` 에서 처리.
jest.mock('aws-amplify', () => ({
  Amplify: { configure: jest.fn() },
}));

// signIn / signOut 도 마찬가지로 aws-amplify/auth 서브경로 — App 이 LoginScreen
// 을 import 하면 transitive 로 로드된다.
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

import { render, screen } from '@testing-library/react-native';
import App from '../App';

describe('App entry', () => {
  // M2: bootstrapSession() 비동기 완료 후 'loading' → 'login' 으로 전환되므로
  // findBy* (Promise) 로 기다린다. SecureStore mock 이 항상 null → 'login' 분기.
  it('초기 진입 시 LoginScreen 을 렌더한다 (인증 전)', async () => {
    render(<App />);
    expect(await screen.findByText('Sign in to continue to CelebBase')).toBeTruthy();
  });

  it('LoginScreen 에 email / password 입력 필드가 있다', async () => {
    render(<App />);
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });
});
