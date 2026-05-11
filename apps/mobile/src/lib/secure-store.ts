// SecureStore wrapper — access_token / refresh_token 을 iOS Keychain / Android
// Keystore 에 저장한다. AsyncStorage 는 평문이라 토큰 저장 금지.
//
// 사용 시점:
//   - 로그인 / signup 성공 시: setTokens({ access_token, refresh_token })
//   - API 호출 시 Bearer 부착: const t = await getAccessToken()
//   - 토큰 갱신 시: setTokens(...)  — 기존 값 덮어씀
//   - 로그아웃 / 계정 삭제 시: clearTokens()
//
// 키 네이밍: spec.md §4.2 mobile auth ingress 의 wire 와 정합.

import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'celebbase.auth.access_token';
const REFRESH_TOKEN_KEY = 'celebbase.auth.refresh_token';

/**
 * access_token 을 SecureStore 에서 읽는다. 미저장 시 null.
 */
export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

/**
 * refresh_token 을 SecureStore 에서 읽는다. 미저장 시 null.
 */
export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

/**
 * access_token 단독 저장. 보통 setTokens() 와 함께 호출.
 */
export async function setAccessToken(token: string): Promise<void> {
  if (token === '') {
    throw new Error('[secure-store] access_token 은 빈 문자열일 수 없다.');
  }
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

/**
 * refresh_token 단독 저장.
 */
export async function setRefreshToken(token: string): Promise<void> {
  if (token === '') {
    throw new Error('[secure-store] refresh_token 은 빈 문자열일 수 없다.');
  }
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

/**
 * 로그인 / 갱신 시 access + refresh 를 함께 저장. 가장 자주 호출되는 헬퍼.
 */
export async function setTokens(tokens: {
  access_token: string;
  refresh_token: string;
}): Promise<void> {
  await setAccessToken(tokens.access_token);
  await setRefreshToken(tokens.refresh_token);
}

/**
 * 로그아웃 / 계정 삭제 시 모든 토큰 제거.
 */
export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
