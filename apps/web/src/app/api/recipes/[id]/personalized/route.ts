import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../../_lib/bff-fetch.js';
import { createProtectedRoute, type Session } from '../../../_lib/session.js';
import { toBffErrorResponse } from '../../../_lib/bff-error.js';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return createProtectedRoute(async (innerReq: NextRequest, session: Session) => {
    const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();
    const forwardedFor = innerReq.headers.get('x-forwarded-for') ?? undefined;
    const result = await fetchBff(
      'content',
      `/recipes/${encodeURIComponent(id)}/personalized`,
      {
        method: 'GET',
        schema: schemas.PersonalizedRecipeResponseSchema,
        requestId,
        forwardedFor,
        userId: session.user_id,
        authToken: session.raw_token,
      },
    );
    if (!result.ok) {
      return toBffErrorResponse(result.error, requestId);
    }
    return new Response(JSON.stringify(result.data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    });
  })(req);
}
