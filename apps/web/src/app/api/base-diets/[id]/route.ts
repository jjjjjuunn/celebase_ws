import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../_lib/bff-fetch.js';
import { createPublicRoute } from '../../_lib/session.js';
import { toBffErrorResponse } from '../../_lib/bff-error.js';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return createPublicRoute(async (innerReq: NextRequest) => {
    const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();
    const forwardedFor = innerReq.headers.get('x-forwarded-for') ?? undefined;
    // content-service returns the base-diet row UNWRAPPED (like /celebrities/:slug).
    // Validate against the wire schema, then wrap as { base_diet } to match the
    // mobile contract (BaseDietDetailResponseSchema). Validating the unwrapped
    // upstream response against the wrapped schema was the BFF_CONTRACT_VIOLATION
    // (502) — mirrors the /celebrities/[slug] route pattern.
    const result = await fetchBff('content', `/base-diets/${encodeURIComponent(id)}`, {
      method: 'GET',
      schema: schemas.BaseDietWireSchema,
      requestId,
      forwardedFor,
    });
    if (!result.ok) {
      return toBffErrorResponse(result.error, requestId);
    }
    return new Response(JSON.stringify({ base_diet: result.data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    });
  })(req);
}
