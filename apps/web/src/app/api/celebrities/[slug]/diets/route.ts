import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../../_lib/bff-fetch.js';
import { createPublicRoute } from '../../../_lib/session.js';
import { toBffErrorResponse } from '../../../_lib/bff-error.js';

// content-service returns { items: [...] }, BFF contract uses { diets: [...] }
const ContentDietsSchema = z.object({ items: z.array(schemas.BaseDietWireSchema) });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  return createPublicRoute(async (innerReq: NextRequest) => {
    const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();
    const forwardedFor = innerReq.headers.get('x-forwarded-for') ?? undefined;
    const result = await fetchBff(
      'content',
      `/celebrities/${encodeURIComponent(slug)}/diets`,
      {
        method: 'GET',
        schema: ContentDietsSchema,
        requestId,
        forwardedFor,
      },
    );
    if (!result.ok) {
      return toBffErrorResponse(result.error, requestId);
    }
    return new Response(JSON.stringify({ diets: result.data.items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    });
  })(req);
}
