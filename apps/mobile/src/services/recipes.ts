// recipes BFF read path — meal plan 의 recipe_id 를 사람이 읽는 제목으로 해석.
// content-service `/recipes?ids=` 를 BFF (`/api/recipes`) 가 wrap 한 batch route.
// rule #10 준수: recipe 데이터는 content-service 소유, mpe 직접 조인 X.

import { schemas } from '@celebbase/shared-types';

import { authedFetch } from '../lib/fetch-with-refresh';

/**
 * recipe_id 목록을 제목 해석용으로 batch 조회한다 (순서 무관, 미페이지).
 * 빈 목록이면 네트워크 호출 없이 빈 응답 반환.
 *
 * @throws ApiError BFF 4xx/5xx
 */
export async function getRecipesByIds(ids: string[]): Promise<schemas.RecipeBatchResponse> {
  if (ids.length === 0) return { recipes: [] };
  const search = new URLSearchParams({ ids: ids.join(',') });
  const raw = await authedFetch<unknown>(`/api/recipes?${search.toString()}`);
  return schemas.RecipeBatchResponseSchema.parse(raw);
}
