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

function requireEnv(name: CognitoEnvName, raw: unknown): string {
  if (typeof raw !== 'string' || raw === '') {
    throw new Error(
      '[cognito] Missing required env vars. Required: ' +
        'EXPO_PUBLIC_COGNITO_USER_POOL_ID, EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID, EXPO_PUBLIC_AWS_REGION.',
    );
  }
  return raw;
}

function readCognitoEnv(): CognitoEnv {
  // Static `process.env['EXPO_PUBLIC_*']` literal access so Expo's Babel transform
  // inlines the values into the Release/production bundle. Dynamic access
  // (process.env[name]) is NOT inlined and resolves to undefined in Release,
  // which crashed the app at startup (white screen).
  return {
    userPoolId: requireEnv(
      'EXPO_PUBLIC_COGNITO_USER_POOL_ID',
      process.env['EXPO_PUBLIC_COGNITO_USER_POOL_ID'],
    ),
    userPoolClientId: requireEnv(
      'EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID',
      process.env['EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID'],
    ),
    region: requireEnv('EXPO_PUBLIC_AWS_REGION', process.env['EXPO_PUBLIC_AWS_REGION']),
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

  // DEV-ONLY escape hatch (opt-in): EXPO_PUBLIC_DEV_SKIP_AUTH=1 일 때만 env 미주입을
  // 허용. 미설정이면 기존대로 throw — prod 안전성 유지.
  // 실제 signIn / signUp 호출 시점에 Amplify 가 자체적으로 에러. UI 점검 전용.
  if (__DEV__ && process.env['EXPO_PUBLIC_DEV_SKIP_AUTH'] === '1') {
    const hasAllEnv =
      typeof process.env['EXPO_PUBLIC_COGNITO_USER_POOL_ID'] === 'string' &&
      process.env['EXPO_PUBLIC_COGNITO_USER_POOL_ID'] !== '' &&
      process.env['EXPO_PUBLIC_COGNITO_USER_POOL_ID'] !== 'us-west-2_XXXXXXXXX' &&
      typeof process.env['EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID'] === 'string' &&
      process.env['EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID'] !== '' &&
      typeof process.env['EXPO_PUBLIC_AWS_REGION'] === 'string' &&
      process.env['EXPO_PUBLIC_AWS_REGION'] !== '';
    if (!hasAllEnv) {
      // eslint-disable-next-line no-console
      console.warn('[cognito] DEV_SKIP_AUTH: env 미주입 → Amplify.configure skip (UI 점검 전용)');
      configured = true;
      return;
    }
  }

  const { userPoolId, userPoolClientId } = readCognitoEnv();

  // Cognito is configured for SRP (email/password) ONLY. Social sign-in
  // (Apple/Google) no longer flows through Cognito Hosted-UI federation — it
  // is verified natively by user-service (IMPL-MOBILE-SOCIAL-NATIVE-001), so
  // there is no `loginWith.oauth` block here anymore.
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
