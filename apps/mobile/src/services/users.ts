// User self read — Profile 화면, Settings 의 email 표시 등에서 사용.

import { schemas } from '@celebbase/shared-types';

import { authedFetch } from '../lib/fetch-with-refresh';

/**
 * GET /api/users/me — 현재 로그인 사용자의 user record.
 *
 * @throws ApiError BFF 4xx/5xx
 */
export async function getCurrentUser(): Promise<schemas.MeResponse> {
  const raw = await authedFetch<unknown>('/api/users/me');
  return schemas.MeResponseSchema.parse(raw);
}

/**
 * DELETE /api/users/me — 계정 삭제 (Apple Guideline 5.1.1(v) in-app 경로).
 *
 * user-service 가 `deleted_at` soft-delete → 이후 로그인/refresh 차단. PHI 파기
 * 배치는 별도 백엔드 처리 (security.md §계정 삭제). BFF 는 204 (no body) 반환 —
 * authedFetch 는 빈 본문을 null 로 통과시키므로 별도 파싱 없이 성공 = void.
 *
 * @throws ApiError BFF 4xx/5xx (호출자가 명시적으로 처리, silent ignore 금지)
 */
export async function deleteAccount(): Promise<void> {
  await authedFetch<unknown>('/api/users/me', { method: 'DELETE' });
}
