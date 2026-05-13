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

// React Navigation 의 NavigationContainer 는 jest 환경에서 SafeAreaProviderCompat
// 초기화 이슈가 있다. RootNavigator 내부 동작 (Login 진입) 은 LoginScreen.test.tsx +
// 각 화면 별 unit test 에서 검증. 본 entry test 는 module load + 첫 render 가 throw
// 없이 통과하는지만 확인 (smoke).
jest.mock('../src/navigation/RootNavigator', () => ({
  RootNavigator: () => null,
}));

import { render } from '@testing-library/react-native';
import App from '../App';

describe('App entry', () => {
  it('boots without crash (smoke)', () => {
    expect(() => render(<App />)).not.toThrow();
  });
});
