// Amplify v6 polyfill — Amplify SRP 가 첫 호출 시점에 crypto.getRandomValues 를
// 요구한다. 다른 모든 import 보다 먼저 위치해야 한다.
import 'react-native-get-random-values';

import { Amplify } from 'aws-amplify';

type CognitoEnvName =
  | 'EXPO_PUBLIC_COGNITO_USER_POOL_ID'
  | 'EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID'
  | 'EXPO_PUBLIC_AWS_REGION';

interface CognitoEnv {
  userPoolId: string;
  userPoolClientId: string;
  region: string;
}

function requireEnv(name: CognitoEnvName): string {
  const raw: unknown = process.env[name];
  if (typeof raw !== 'string' || raw === '') {
    throw new Error(
      '[cognito] Missing required env vars. Required: ' +
        'EXPO_PUBLIC_COGNITO_USER_POOL_ID, EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID, EXPO_PUBLIC_AWS_REGION.',
    );
  }
  return raw;
}

function readCognitoEnv(): CognitoEnv {
  return {
    userPoolId: requireEnv('EXPO_PUBLIC_COGNITO_USER_POOL_ID'),
    userPoolClientId: requireEnv('EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID'),
    region: requireEnv('EXPO_PUBLIC_AWS_REGION'),
  };
}

let configured = false;

/**
 * Amplify v6 의 Cognito User Pool 설정을 1회 적용한다.
 * idempotent — 2회 이상 호출되어도 Amplify.configure 는 최초 1회만 실행된다.
 *
 * 호출 시점: 앱 module load (App.tsx 상단). 실제 signIn / signUp 호출 이전.
 *
 * @throws Error 환경 변수 (EXPO_PUBLIC_COGNITO_USER_POOL_ID,
 *         EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID, EXPO_PUBLIC_AWS_REGION)
 *         중 하나라도 비어있으면 명시적으로 throw.
 */
export function configureCognito(): void {
  if (configured) return;
  const { userPoolId, userPoolClientId } = readCognitoEnv();
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
      },
    },
  });
  configured = true;
}

/**
 * Test-only: jest test 간 idempotency 플래그를 리셋한다.
 * Production 코드에서 호출 금지 — naming convention (`__` prefix) 으로 internal 표시.
 */
export function __resetCognitoForTest(): void {
  configured = false;
}
