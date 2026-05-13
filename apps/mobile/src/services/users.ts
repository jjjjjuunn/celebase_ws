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
