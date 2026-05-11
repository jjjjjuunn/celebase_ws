// BFF (apps/web/src/app/api/**) 호출용 fetch wrapper.
// spec.md §4.2 mobile auth ingress: BFF 는 mobile 의 active gateway. cookie path
// 는 web 호환, bearer path 는 mobile 전용 (`createProtectedRoute` Bearer fallback).
// 예외: /auth/refresh 는 user-service 직접 (cookie-shaped BFF route 미사용).

const BFF_BASE_URL_ENV = 'EXPO_PUBLIC_BFF_BASE_URL';

function getBffBaseUrl(): string {
  const raw: unknown = process.env[BFF_BASE_URL_ENV];
  if (typeof raw !== 'string' || raw === '') {
    throw new Error(
      `[api-client] Missing required env var: ${BFF_BASE_URL_ENV}. ` +
        '로컬은 http://localhost:3000 또는 LAN IP, prod 는 https://app.celebbase.com.',
    );
  }
  return raw;
}

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * BFF / user-service 응답이 에러 envelope 일 때 던지는 에러.
 * `status` + `code` 로 호출자 (refresh state machine 등) 가 분기 가능.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly payload: ApiErrorPayload | undefined;

  constructor(status: number, code: string | undefined, message: string, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

interface PostOptions {
  /** 인증 필요한 BFF route 호출 시 Bearer 부착. */
  bearer?: string;
  /** 직접 호출용 base URL override (예: user-service `/auth/refresh`). */
  baseUrlOverride?: string;
}

/**
 * BFF POST 호출. JSON body 직렬화 + JSON 응답 파싱.
 * 4xx/5xx 응답은 `ApiError` 로 throw — `error.status` + `error.code` 로 분기.
 *
 * @throws ApiError upstream 이 에러 envelope 반환 시
 * @throws Error 네트워크 실패 / JSON 파싱 실패 시
 */
export async function postJson<TResponse>(
  path: string,
  body: unknown,
  options: PostOptions = {},
): Promise<TResponse> {
  if (!path.startsWith('/')) {
    throw new Error(`[api-client] path 는 '/' 로 시작해야 한다. received: ${path}`);
  }
  const baseUrl = options.baseUrlOverride ?? getBffBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (options.bearer !== undefined && options.bearer !== '') {
    headers.Authorization = `Bearer ${options.bearer}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text !== '') {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`[api-client] ${String(response.status)} ${path} — invalid JSON body`);
    }
  }

  if (!response.ok) {
    const payload = isErrorPayload(parsed) ? parsed : undefined;
    const code = extractCode(payload);
    const message = extractMessage(payload) ?? `HTTP ${String(response.status)} ${path}`;
    throw new ApiError(response.status, code, message, payload);
  }

  return parsed as TResponse;
}

function isErrorPayload(value: unknown): value is ApiErrorPayload {
  if (typeof value !== 'object' || value === null) return false;
  // envelope shape: { error: { code, message } } 또는 { code, message } 둘 다 처리
  const obj = value as Record<string, unknown>;
  if (typeof obj['error'] === 'object' && obj['error'] !== null) {
    return true;
  }
  return 'code' in obj || 'message' in obj;
}

/**
 * BFF 와 user-service 두 가지 envelope shape 지원:
 *   - flat: `{ code, message }`
 *   - nested: `{ error: { code, message } }`
 * M1-D refresh state machine 은 nested form 의 5종 enum 코드를 분기 키로 사용.
 */
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
