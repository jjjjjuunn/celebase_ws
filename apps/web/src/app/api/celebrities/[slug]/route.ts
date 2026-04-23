import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../_lib/bff-fetch.js';
import { createPublicRoute } from '../../_lib/session.js';
import { toBffErrorResponse } from '../../_lib/bff-error.js';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  return createPublicRoute(async (innerReq: NextRequest) => {
    const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();
    const forwardedFor = innerReq.headers.get('x-forwarded-for') ?? undefined;
    const result = await fetchBff('content', `/celebrities/${encodeURIComponent(slug)}`, {
      method: 'GET',
      schema: schemas.CelebrityWireSchema,
      requestId,
      forwardedFor,
    });
    if (!result.ok) {
      return toBffErrorResponse(result.error, requestId);
    }
    return new Response(JSON.stringify({ celebrity: result.data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    });
  })(req);
}
