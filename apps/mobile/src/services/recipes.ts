// recipes BFF read path — meal plan 의 recipe_id 를 사람이 읽는 제목으로 해석.
// content-service `/recipes?ids=` 를 BFF (`/api/recipes`) 가 wrap 한 batch route.
// rule #10 준수: recipe 데이터는 content-service 소유, mpe 직접 조인 X.

import { schemas } from '@celebbase/shared-types';

import { authedFetch } from '../lib/fetch-with-refresh';

// content-service `/recipes` caps a single request at 32 ids. The calendar can
// reference more across multiple plans, so chunk below that cap and merge.
const MAX_IDS_PER_BATCH = 30;

/**
 * recipe_id 목록을 제목 해석용으로 batch 조회한다 (순서 무관, 미페이지).
 * 빈 목록이면 네트워크 호출 없이 빈 응답 반환. 32개 cap 을 넘으면 청크로 분할 조회.
 *
 * @throws ApiError BFF 4xx/5xx
 */
export async function getRecipesByIds(ids: string[]): Promise<schemas.RecipeBatchResponse> {
  if (ids.length === 0) return { recipes: [] };

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_BATCH) {
    chunks.push(ids.slice(i, i + MAX_IDS_PER_BATCH));
  }

  const responses = await Promise.all(
    chunks.map(async (chunk) => {
      const search = new URLSearchParams({ ids: chunk.join(',') });
      const raw = await authedFetch<unknown>(`/api/recipes?${search.toString()}`);
      return schemas.RecipeBatchResponseSchema.parse(raw);
    }),
  );

  return { recipes: responses.flatMap((r) => r.recipes) };
}

/**
 * 단일 recipe 상세 조회 (재료 포함). 상세 엔드포인트(`/api/recipes/:id`)가 recipe + 재료를
 * 반환한다. content `/recipes/:id` 공개화 배포 전에는 401 이 날 수 있어, 공개 batch
 * 엔드포인트로 fallback 한다 (재료는 빈 배열 — 카탈로그/영양/조리단계는 그대로 표시).
 *
 * @throws Error 미존재 / ApiError BFF 4xx·5xx (둘 다 실패 시)
 */
export async function getRecipeDetail(id: string): Promise<schemas.RecipeDetailResponse> {
  try {
    const raw = await authedFetch<unknown>(`/api/recipes/${encodeURIComponent(id)}`);
    return schemas.RecipeDetailResponseSchema.parse(raw);
  } catch {
    const { recipes } = await getRecipesByIds([id]);
    if (recipes.length === 0) {
      throw new Error(`Recipe not found: ${id}`);
    }
    return { recipe: recipes[0], ingredients: [] };
  }
}
