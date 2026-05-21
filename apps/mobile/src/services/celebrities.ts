// celebrities BFF read path — 온보딩 S2 Persona Select 의 셀럽 그리드 fetch.
// content-service `/celebrities` 를 BFF (`/api/celebrities`) 가 wrap 한 public
// route. claims feed 와 동일 패턴 (M3).

import { schemas } from '@celebbase/shared-types';

import { authedFetch } from '../lib/fetch-with-refresh';

export type ListCelebritiesParams = {
  /** 미지원 cursor / limit 는 BE 가 default 적용. 현재는 단순 list. */
  cursor?: string;
  limit?: number;
};

/**
 * 셀럽 목록 조회 (cursor pagination).
 * 본 task scope 에선 첫 페이지만 사용 (~25개) — 페이지네이션은 후속.
 *
 * @throws ApiError BFF 4xx/5xx
 */
export async function listCelebrities(
  params: ListCelebritiesParams = {},
): Promise<schemas.CelebrityListResponse> {
  const search = new URLSearchParams();
  if (params.cursor !== undefined && params.cursor !== '') search.set('cursor', params.cursor);
  if (params.limit !== undefined) search.set('limit', String(params.limit));

  const qs = search.toString();
  const path = qs === '' ? '/api/celebrities' : `/api/celebrities?${qs}`;

  const raw = await authedFetch<unknown>(path);
  return schemas.CelebrityListResponseSchema.parse(raw);
}

/**
 * 단일 celebrity 조회 — CelebrityDetail 화면 진입 시 사용.
 *
 * @param slug URL-safe identifier (e.g. 'beyonce')
 * @throws ApiError BFF 4xx/5xx
 */
export async function getCelebrity(
  slug: string,
): Promise<{ celebrity: schemas.CelebrityWire }> {
  const raw = (await authedFetch<unknown>(
    `/api/celebrities/${encodeURIComponent(slug)}`,
  )) as { celebrity: schemas.CelebrityWire };
  return raw;
}

/**
 * 특정 celebrity 의 claims 목록 조회 — CelebrityDetail body section.
 */
export async function listCelebrityClaims(
  slug: string,
): Promise<schemas.LifestyleClaimListResponse> {
  const raw = await authedFetch<unknown>(
    `/api/celebrities/${encodeURIComponent(slug)}/claims`,
  );
  return schemas.LifestyleClaimListResponseSchema.parse(raw);
}

/**
 * 셀럽의 base_diet 목록 — 식단 생성 시 "셀럽 선택 → 그 셀럽 base_diet_id" 로컬 조인.
 * 현재 seed 는 셀럽당 base_diet 1개라 첫 row 를 사용 (다중 diet 선택은 post-launch).
 * 데이터 소유는 content-service (rule #10: meal-plan-engine 직접 조인 금지).
 *
 * @throws ApiError BFF 4xx/5xx
 */
export async function getCelebrityDiets(
  slug: string,
): Promise<schemas.CelebrityDietsResponse> {
  const raw = await authedFetch<unknown>(
    `/api/celebrities/${encodeURIComponent(slug)}/diets`,
  );
  return schemas.CelebrityDietsResponseSchema.parse(raw);
}

/**
 * 단일 base_diet 조회 — plan 캘린더에서 base_diet_id → 셀럽명 역방향 조인용
 * (BaseDietWire.celebrity_id + name). content-service 소유.
 *
 * @throws ApiError BFF 4xx/5xx
 */
export async function getBaseDiet(
  id: string,
): Promise<schemas.BaseDietDetailResponse> {
  const raw = await authedFetch<unknown>(
    `/api/base-diets/${encodeURIComponent(id)}`,
  );
  return schemas.BaseDietDetailResponseSchema.parse(raw);
}
