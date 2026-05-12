// content-service `lifestyle_claims` 도메인의 mobile read path.
// BFF `/api/claims/feed`, `/api/claims/:id` 를 경유 (PIVOT-MOBILE-2026-05 의
// active gateway 정합). 두 endpoint 모두 public 이라 Bearer 없이도 동작하나,
// `authedFetch` 를 사용하면 토큰이 있을 때 자동 부착되어 BE 의 향후 personalize
// 시나리오 (예: 이미 본 카드 marking) 와도 자연스럽게 호환된다.

import { schemas, type ClaimType } from '@celebbase/shared-types';

import { authedFetch } from '../lib/fetch-with-refresh';

export type ListClaimsParams = {
  /** undefined → 전체. ClaimType enum 값 7종 (food/workout/sleep/beauty/brand/philosophy/supplement). */
  claimType?: ClaimType;
  /** 다음 페이지 cursor (서버가 발급). undefined → 첫 페이지. */
  cursor?: string;
  /** 페이지 크기. 기본 20, 최대 100 (BE limit). */
  limit?: number;
};

/**
 * Wellness claim feed 조회 (cursor pagination).
 *
 * @throws ApiError BFF 4xx/5xx
 * @throws Error 네트워크 / JSON / Zod parse 실패
 */
export async function listClaims(
  params: ListClaimsParams = {},
): Promise<schemas.LifestyleClaimListResponse> {
  const search = new URLSearchParams();
  if (params.claimType !== undefined) search.set('claim_type', params.claimType);
  if (params.cursor !== undefined && params.cursor !== '') {
    search.set('cursor', params.cursor);
  }
  if (params.limit !== undefined) search.set('limit', String(params.limit));

  const qs = search.toString();
  const path = qs === '' ? '/api/claims/feed' : `/api/claims/feed?${qs}`;

  const raw = await authedFetch<unknown>(path);
  return schemas.LifestyleClaimListResponseSchema.parse(raw);
}

/**
 * 단일 claim 상세 (claim + sources).
 */
export async function getClaim(
  id: string,
): Promise<schemas.LifestyleClaimDetailResponse> {
  if (id === '') {
    throw new Error('[claims] id 는 빈 문자열일 수 없다.');
  }
  const raw = await authedFetch<unknown>(`/api/claims/${encodeURIComponent(id)}`);
  return schemas.LifestyleClaimDetailResponseSchema.parse(raw);
}
