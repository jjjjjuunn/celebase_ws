// jest.mock 은 hoisted 되므로 import 이전에 위치 — aws-amplify 의 RN export
// (.ts source) 가 jest transform 범위 밖이라 모듈 로드 자체를 차단해야 한다.
jest.mock('aws-amplify', () => ({
  Amplify: { configure: jest.fn() },
}));

import { Amplify } from 'aws-amplify';

import { __resetCognitoForTest, configureCognito } from '../../src/lib/cognito';

describe('configureCognito()', () => {
  let configureSpy: jest.SpyInstance;

  beforeEach(() => {
    configureSpy = jest.spyOn(Amplify, 'configure').mockImplementation(() => undefined);
    __resetCognitoForTest();
    // jest.setup.js 가 baseline env 를 셋업. delete 가 발생하는 테스트도 다음
    // 테스트 시작 시 여기서 재셋업되므로 process.env 전체 교체는 불필요.
    process.env['EXPO_PUBLIC_COGNITO_USER_POOL_ID'] = 'us-west-2_TEST';
    process.env['EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID'] = 'test-client-id';
    process.env['EXPO_PUBLIC_AWS_REGION'] = 'us-west-2';
  });

  afterEach(() => {
    configureSpy.mockRestore();
  });

  it('Amplify.configure 를 정확한 Cognito 설정으로 1회 호출한다', () => {
    configureCognito();
    expect(configureSpy).toHaveBeenCalledTimes(1);
    expect(configureSpy).toHaveBeenCalledWith({
      Auth: {
        Cognito: {
          userPoolId: 'us-west-2_TEST',
          userPoolClientId: 'test-client-id',
        },
      },
    });
  });

  it('idempotent — 2회 호출해도 Amplify.configure 는 1회만 호출된다', () => {
    configureCognito();
    configureCognito();
    expect(configureSpy).toHaveBeenCalledTimes(1);
  });

  it('USER_POOL_ID 누락 시 명확한 Error 를 던진다', () => {
    delete process.env['EXPO_PUBLIC_COGNITO_USER_POOL_ID'];
    expect(() => {
      configureCognito();
    }).toThrow(/Missing required env vars/);
    expect(configureSpy).not.toHaveBeenCalled();
  });

  it('CLIENT_ID 누락 시 명확한 Error 를 던진다', () => {
    delete process.env['EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID'];
    expect(() => {
      configureCognito();
    }).toThrow(/Missing required env vars/);
  });
});
