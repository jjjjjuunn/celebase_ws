jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { ApiError } from '../../src/lib/api-client';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';
import { getClaim, listClaims } from '../../src/services/claims';

describe('claims service', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPendingRefresh();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    process.env['EXPO_PUBLIC_USER_SERVICE_URL'] = 'http://localhost:3001';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function makeResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const CLAIM_FIXTURE = {
    id: '01927000-0000-7000-8000-000000000001',
    celebrity_id: '018d1a6a-0000-7000-8000-000000000040',
    claim_type: 'food' as const,
    headline: 'celery juice ritual',
    body: null,
    trust_grade: 'B' as const,
    primary_source_url: 'https://vogue.com/celery',
    verified_by: null,
    last_verified_at: '2026-04-01T00:00:00.000Z',
    is_health_claim: false,
    disclaimer_key: null,
    base_diet_id: null,
    tags: [],
    status: 'published' as const,
    published_at: '2026-04-15T00:00:00.000Z',
    is_active: true,
    created_at: '2026-04-15T00:00:00.000Z',
    updated_at: '2026-04-15T00:00:00.000Z',
  };

  describe('listClaims()', () => {
    it('파라미터 없이 호출 → /api/claims/feed (query 없음)', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse(200, { claims: [CLAIM_FIXTURE], next_cursor: null, has_next: false }),
      );

      const res = await listClaims();

      expect(res.claims).toHaveLength(1);
      expect(res.has_next).toBe(false);
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3000/api/claims/feed');
    });

    it('claimType 전달 → query string 에 claim_type 포함', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse(200, { claims: [], next_cursor: null, has_next: false }),
      );

      await listClaims({ claimType: 'food' });

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3000/api/claims/feed?claim_type=food');
    });

    it('cursor + limit 전달 → query string 에 둘 다 포함', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse(200, { claims: [], next_cursor: null, has_next: false }),
      );

      await listClaims({ cursor: 'abc123', limit: 50 });

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('cursor=abc123');
      expect(url).toContain('limit=50');
    });

    it('빈 페이지 응답 → has_next:false 그대로 반환', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse(200, { claims: [], next_cursor: null, has_next: false }),
      );

      const res = await listClaims();

      expect(res.claims).toEqual([]);
      expect(res.next_cursor).toBeNull();
      expect(res.has_next).toBe(false);
    });

    it('BFF 5xx → ApiError throw', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse(500, { error: { code: 'INTERNAL', message: 'boom' } }),
      );

      await expect(listClaims()).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('getClaim()', () => {
    it('id encoding + detail 응답 파싱', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse(200, { claim: CLAIM_FIXTURE, sources: [] }),
      );

      const res = await getClaim(CLAIM_FIXTURE.id);

      expect(res.claim.id).toBe(CLAIM_FIXTURE.id);
      expect(res.sources).toEqual([]);
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://localhost:3000/api/claims/${CLAIM_FIXTURE.id}`);
    });

    it('빈 id → Error throw (fetch 미호출)', async () => {
      await expect(getClaim('')).rejects.toThrow('id 는 빈 문자열');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('404 → ApiError throw', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse(404, { error: { code: 'NOT_FOUND', message: 'no claim' } }),
      );

      await expect(getClaim(CLAIM_FIXTURE.id)).rejects.toMatchObject({
        name: 'ApiError',
        status: 404,
        code: 'NOT_FOUND',
      });
    });
  });
});
