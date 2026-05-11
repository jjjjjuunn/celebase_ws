// 인증된 요청용 fetch wrapper — Bearer 자동 부착 + 401 자동 refresh + 재시도.
//
// 동작:
//   1. SecureStore 의 access_token 을 Authorization: Bearer 헤더로 부착
//   2. BFF 호출 (postJson 의 단발성과 달리 GET/POST/PATCH/DELETE + JSON body 일반화)
//   3. 401 받으면 `refreshTokens()` 1회 호출
//      - status: 'success' → 새 access_token 으로 원 요청 1회 재시도
//      - 그 외 5종 → signalLogout(reason) + ApiError throw
//   4. 무한 루프 방지: 재시도 응답이 또 401 이면 그대로 throw (refresh 2회 X)
//
// Single-flight: 동시 다중 요청이 동시에 401 받아도 refreshTokens() 는 1번만
// 실행. module-level pendingRefresh 를 공유 promise 로 둔다.
//
// 예외: /auth/refresh 자체는 refreshTokens() 가 직접 호출 (postJson + baseUrl
// override) — 본 wrapper 는 BFF 인증 path 만 담당.

import { ApiError, type ApiErrorPayload } from './api-client';
import { getAccessToken } from './secure-store';
import { signalLogout } from './auth-events';
import { refreshTokens, type RefreshResult } from '../services/auth-refresh';

const BFF_BASE_URL_ENV = 'EXPO_PUBLIC_BFF_BASE_URL';

function getBffBaseUrl(): string {
  const raw: unknown = process.env[BFF_BASE_URL_ENV];
  if (typeof raw !== 'string' || raw === '') {
    throw new Error(
      `[fetch-with-refresh] Missing required env var: ${BFF_BASE_URL_ENV}.`,
    );
  }
  return raw;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface AuthedFetchOptions {
  method?: HttpMethod;
  /** JSON 직렬화될 body. method 가 GET 이면 무시된다. */
  body?: unknown;
  /** 추가 헤더 (Authorization 은 자동 부착되므로 override 비권장). */
  headers?: Record<string, string>;
  /** baseURL override — BFF 가 아닌 다른 origin 호출 시. */
  baseUrlOverride?: string;
}

/**
 * 동시 다발 401 시 refresh 는 1회만. 진행 중인 refresh promise 를 공유.
 */
let pendingRefresh: Promise<RefreshResult> | null = null;

function sharedRefresh(): Promise<RefreshResult> {
  if (pendingRefresh === null) {
    pendingRefresh = refreshTokens().finally(() => {
      pendingRefresh = null;
    });
  }
  return pendingRefresh;
}

/**
 * 인증된 BFF 요청을 보낸다. 401 시 refresh + 재시도 + logout 신호 분기.
 *
 * @throws ApiError 4xx/5xx (refresh 후에도 401 이거나 refresh 실패)
 * @throws Error 네트워크 / JSON 파싱 실패
 */
export async function authedFetch<TResponse>(
  path: string,
  options: AuthedFetchOptions = {},
): Promise<TResponse> {
  if (!path.startsWith('/')) {
    throw new Error(`[fetch-with-refresh] path 는 '/' 로 시작해야 한다. received: ${path}`);
  }

  const accessToken = await getAccessToken();
  const firstAttempt = await doFetch(path, options, accessToken);
  if (firstAttempt.status !== 401) {
    return unwrap(firstAttempt) as TResponse;
  }

  // 401 — refresh state machine 실행 (동시 다발 시 1회로 공유).
  const refreshResult = await sharedRefresh();
  if (refreshResult.status !== 'success') {
    signalLogout(refreshResult.status);
    throw apiErrorFromRaw(firstAttempt);
  }

  // refresh success — 새 토큰으로 1회만 재시도. 또 401 이면 그대로 throw.
  const retry = await doFetch(path, options, refreshResult.tokens.access_token);
  return unwrap(retry) as TResponse;
}

/**
 * 내부 fetch 실행 결과 + parsed body 를 그대로 반환. 호출자가 status 로 분기.
 */
interface RawResponse {
  status: number;
  ok: boolean;
  path: string;
  parsed: unknown;
}

async function doFetch(
  path: string,
  options: AuthedFetchOptions,
  accessToken: string | null,
): Promise<RawResponse> {
  const baseUrl = options.baseUrlOverride ?? getBffBaseUrl();
  const url = `${baseUrl}${path}`;
  const method: HttpMethod = options.method ?? 'GET';

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };
  if (accessToken !== null && accessToken !== '') {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const hasBody = method !== 'GET' && options.body !== undefined;
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  const init: RequestInit = {
    method,
    headers,
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
  };

  const response = await fetch(url, init);

  const text = await response.text();
  let parsed: unknown = null;
  if (text !== '') {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error(
        `[fetch-with-refresh] ${String(response.status)} ${path} — invalid JSON body`,
      );
    }
  }

  return { status: response.status, ok: response.ok, path, parsed };
}

function unwrap(raw: RawResponse): unknown {
  if (raw.ok) {
    return raw.parsed;
  }
  throw apiErrorFromRaw(raw);
}

function apiErrorFromRaw(raw: RawResponse): ApiError {
  const payload = isErrorPayload(raw.parsed) ? raw.parsed : undefined;
  const code = extractCode(payload);
  const message = extractMessage(payload) ?? `HTTP ${String(raw.status)} ${raw.path}`;
  return new ApiError(raw.status, code, message, payload);
}

function isErrorPayload(value: unknown): value is ApiErrorPayload {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj['error'] === 'object' && obj['error'] !== null) return true;
  return 'code' in obj || 'message' in obj;
}

function extractCode(payload: ApiErrorPayload | undefined): string | undefined {
  if (payload === undefined) return undefined;
  if (typeof payload.code === 'string') return payload.code;
  const errorVal = payload['error'];
  if (typeof errorVal === 'object' && errorVal !== null) {
    const errObj = errorVal as Record<string, unknown>;
    const nestedCode = errObj['code'];
    if (typeof nestedCode === 'string') return nestedCode;
  }
  return undefined;
}

function extractMessage(payload: ApiErrorPayload | undefined): string | undefined {
  if (payload === undefined) return undefined;
  if (typeof payload.message === 'string') return payload.message;
  const errorVal = payload['error'];
  if (typeof errorVal === 'object' && errorVal !== null) {
    const errObj = errorVal as Record<string, unknown>;
    const nestedMessage = errObj['message'];
    if (typeof nestedMessage === 'string') return nestedMessage;
  }
  return undefined;
}

/**
 * 테스트 전용 — pendingRefresh 를 강제 비운다.
 */
export function __resetPendingRefresh(): void {
  pendingRefresh = null;
}
