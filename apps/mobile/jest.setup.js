// jest setupFiles — test environment 초기화 직후, 각 test 파일의 import 보다
// 먼저 실행된다.
//
// 목적: App.tsx 가 module load 시점에 configureCognito() 를 호출하므로 jest 가
// App 을 import 하기 전에 환경 변수가 채워져 있어야 한다. test 파일 안에서
// process.env 를 세팅하면 ES import hoisting 때문에 cognito 모듈 load 가
// 먼저 일어나 throw 발생. setupFiles 단계에 두면 import 보다 확실히 앞.
process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID = 'us-west-2_TEST';
process.env.EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID = 'test-client-id';
process.env.EXPO_PUBLIC_AWS_REGION = 'us-west-2';

// react-native-purchases — module load 시 NativeEventEmitter 구성. jest 환경에선
// native 모듈 부재로 throw. 전역 mock 으로 SDK API 통째 stub. 개별 테스트가 더 정교한
// 동작 필요 시 jest.mock(...) 으로 override.
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn().mockResolvedValue(undefined),
    getOfferings: jest.fn().mockResolvedValue({ current: null, all: {} }),
    logIn: jest.fn().mockResolvedValue(undefined),
    logOut: jest.fn().mockResolvedValue(undefined),
    purchasePackage: jest.fn().mockResolvedValue({}),
    restorePurchases: jest.fn().mockResolvedValue({}),
  },
  LOG_LEVEL: { VERBOSE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 },
}));

// react-native-safe-area-context — jest 환경에선 native UIManager 부재라 RNCSafeAreaProvider
// placeholder 만 렌더되어 children 이 표시되지 않는다. Provider/View 모두 children 통과.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children, ...props }) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  };
});
