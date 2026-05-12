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
