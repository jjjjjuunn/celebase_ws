import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../_lib/bff-fetch.js';
import { createPublicRoute } from '../../_lib/session.js';
import { toBffErrorResponse } from '../../_lib/bff-error.js';

const MOCK_CLAIM_LIST = {
  claims: [
    {
      id: '01927000-0000-7000-8000-000000000001',
      celebrity_id: '018d1a6a-0000-7000-8000-000000000040',
      claim_type: 'food',
      headline: 'Starts every morning with celery juice',
      body: null,
      trust_grade: 'B',
      primary_source_url: 'https://www.vogue.com/article/celery-juice-routine',
      verified_by: null,
      last_verified_at: '2026-04-01T00:00:00.000Z',
      is_health_claim: false,
      disclaimer_key: null,
      base_diet_id: null,
      tags: ['morning-routine'],
      status: 'published',
      published_at: '2026-04-15T00:00:00.000Z',
      is_active: true,
      created_at: '2026-04-15T00:00:00.000Z',
      updated_at: '2026-04-15T00:00:00.000Z',
    },
  ],
  next_cursor: null,
  has_next: false,
};

export async function GET(req: NextRequest): Promise<Response> {
  return createPublicRoute(async (innerReq: NextRequest) => {
    const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();
    const forwardedFor = innerReq.headers.get('x-forwarded-for') ?? undefined;

    if (process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'] === 'true') {
      const parsed = schemas.LifestyleClaimListResponseSchema.parse(MOCK_CLAIM_LIST);
      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
          'X-BFF-Mock': 'claims',
        },
      });
    }

    const search = innerReq.nextUrl.search;
    const result = await fetchBff('content', `/claims/feed${search}`, {
      method: 'GET',
      schema: schemas.LifestyleClaimListResponseSchema,
      requestId,
      forwardedFor,
    });
    if (!result.ok) {
      return toBffErrorResponse(result.error, requestId);
    }
    return new Response(JSON.stringify(result.data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    });
  })(req);
}
