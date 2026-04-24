import { type NextRequest } from 'next/server';
import { createProtectedRoute, type Session } from '../../_lib/session.js';

export async function GET(req: NextRequest): Promise<Response> {
  return createProtectedRoute(
    async (innerReq: NextRequest, _session: Session): Promise<Response> => {
      void _session;
      const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();

      const orderId = new URL(innerReq.url).searchParams.get('orderId');
      if (orderId === null || orderId.length === 0 || orderId.length > 64) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'orderId query parameter required (max 64 chars)',
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
      if (!/^[A-Za-z0-9_-]+$/.test(orderId)) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'orderId contains invalid characters',
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
            message: 'Instacart order status adapter pending.',
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
