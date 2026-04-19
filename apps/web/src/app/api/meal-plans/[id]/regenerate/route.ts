import 'server-only';
import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../../_lib/bff-fetch.js';
import { createProtectedRoute, type Session } from '../../../_lib/session.js';
import { toBffErrorResponse } from '../../../_lib/error.js';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return createProtectedRoute(async (innerReq: NextRequest, session: Session) => {
    const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();
    const forwardedFor = innerReq.headers.get('x-forwarded-for') ?? undefined;

    const rawBody: unknown = await innerReq.json().catch(() => ({}));
    const parsedBody = schemas.RegenerateMealPlanRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid regenerate request body',
            requestId,
          },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        },
      );
    }

    const result = await fetchBff(
      'meal-plan',
      `/meal-plans/${encodeURIComponent(id)}/regenerate`,
      {
        method: 'POST',
        body: JSON.stringify(parsedBody.data),
        schema: schemas.RegenerateMealPlanResponseSchema,
        requestId,
        forwardedFor,
        userId: session.user_id,
        timeoutMs: 30_000,
      },
    );
    if (!result.ok) {
      return toBffErrorResponse(result.error, requestId);
    }
    return new Response(JSON.stringify(result.data), {
      status: 202,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    });
  })(req);
}
