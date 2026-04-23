import { type NextRequest } from 'next/server';
import { createProtectedRoute, type Session } from '../../../_lib/session.js';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return createProtectedRoute(
    async (innerReq: NextRequest, _session: Session): Promise<Response> => {
      void _session;
      const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();

      if (id.length === 0 || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid meal plan id',
              requestId,
            },
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'X-Request-Id': requestId,
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          error: {
            code: 'NOT_IMPLEMENTED',
            message:
              'meal-plan-engine /meal-plans/{id}/safety endpoint is not yet available (IMPL-BE-mealplan-safety pending).',
            requestId,
          },
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': requestId,
          },
        },
      );
    },
  )(req);
}
