import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../_lib/bff-fetch.js';
import { createPublicRoute } from '../../_lib/session.js';
import { toBffErrorResponse } from '../../_lib/bff-error.js';

const MOCK_CLAIM_DETAIL = {
  claim: {
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
  sources: [
    {
      id: '01927000-0000-7000-8000-000000000101',
      claim_id: '01927000-0000-7000-8000-000000000001',
      source_type: 'article',
      outlet: 'Vogue',
      url: 'https://www.vogue.com/article/celery-juice-routine',
      published_date: '2026-04-01',
      excerpt: 'I drink celery juice every morning before anything else.',
      is_primary: true,
      created_at: '2026-04-15T00:00:00.000Z',
    },
  ],
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return createPublicRoute(async (innerReq: NextRequest) => {
    const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();
    const forwardedFor = innerReq.headers.get('x-forwarded-for') ?? undefined;

    if (process.env['NEXT_PUBLIC_USE_MOCK_CLAIMS'] === 'true') {
      const parsed = schemas.LifestyleClaimDetailResponseSchema.parse(MOCK_CLAIM_DETAIL);
      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
          'X-BFF-Mock': 'claims',
        },
      });
    }

    const result = await fetchBff('content', `/claims/${encodeURIComponent(id)}`, {
      method: 'GET',
      schema: schemas.LifestyleClaimDetailResponseSchema,
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
