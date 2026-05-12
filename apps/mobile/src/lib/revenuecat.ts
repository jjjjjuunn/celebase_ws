// RevenueCat SDK 초기화 — Cognito 모듈과 동일한 idempotent configure 패턴.
//
// 호출 시점: 앱 module load (App.tsx 상단), configureCognito 직후.
// `Purchases.configure()` 는 1회만 실행. appUserID 는 로그인 후 별도 호출 필요.
//
// DEV-only escape hatch: env 미주입 시 throw 대신 warn + skip — UI 둘러보기 전용.
// 실제 purchase 호출 시점에 SDK 가 자체적으로 에러를 던지므로 silent 위험 없음.

import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

type RevenueCatEnvName =
  | 'EXPO_PUBLIC_REVENUECAT_IOS_KEY'
  | 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY';

function readApiKey(): string | null {
  const envName: RevenueCatEnvName =
    Platform.OS === 'ios'
      ? 'EXPO_PUBLIC_REVENUECAT_IOS_KEY'
      : 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY';
  const raw: unknown = process.env[envName];
  if (typeof raw !== 'string' || raw === '') return null;
  return raw;
}

let configured = false;

/**
 * RevenueCat SDK 의 platform 별 public API key 를 적용한다.
 * idempotent — 2회 이상 호출되어도 Purchases.configure 는 1회만.
 *
 * @throws Error prod 빌드에서 env 미주입 시 명시적 throw.
 */
export function configureRevenueCat(): void {
  if (configured) return;

  const apiKey = readApiKey();
  if (apiKey === null) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        '[revenuecat] DEV mode: API key 미주입 → Purchases.configure skip (UI 점검 전용)',
      );
      configured = true;
      return;
    }
    throw new Error(
      '[revenuecat] Missing required env var: ' +
        (Platform.OS === 'ios'
          ? 'EXPO_PUBLIC_REVENUECAT_IOS_KEY'
          : 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY'),
    );
  }

  // DEBUG 로그는 dev 에서만 — prod 는 WARN 만.
  void Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  Purchases.configure({ apiKey });
  configured = true;
}

/**
 * 로그인 직후 호출 — RevenueCat 의 appUserID 를 internal user_id 로 동기화.
 * 한 사용자가 여러 디바이스에서 같은 구독을 공유하기 위해 필수.
 *
 * @param userId internal user_id (Cognito sub 아님 — BFF /auth/login response 의 user.id)
 */
export async function identifyRevenueCatUser(userId: string): Promise<void> {
  if (!configured) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[revenuecat] DEV mode: not configured → logIn skip');
      return;
    }
    throw new Error('[revenuecat] configureRevenueCat() must be called first');
  }
  if (!hasNativeModule()) return; // DEV stub path
  await Purchases.logIn(userId);
}

/**
 * 로그아웃 직후 호출 — anonymous appUserID 로 복귀.
 */
export async function resetRevenueCatUser(): Promise<void> {
  if (!configured || !hasNativeModule()) return;
  await Purchases.logOut();
}

/**
 * `configured = true` 이지만 native module 이 없을 때 (Expo Go 등) 판별.
 * react-native-purchases 는 native module 부재 시 configure 가 no-op 처럼 동작.
 */
function hasNativeModule(): boolean {
  if (__DEV__) {
    // Expo Go 에서 react-native-purchases native module 부재 → API key 미주입 case
    // 와 동일하게 silent skip. configureRevenueCat 이 이미 warn 출력했으므로 추가 noise X.
    return readApiKey() !== null;
  }
  return true;
}

/**
 * Test-only — configured 플래그 리셋.
 */
export function __resetRevenueCatForTest(): void {
  configured = false;
}
