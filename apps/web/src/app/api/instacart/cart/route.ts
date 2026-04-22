import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createProtectedRoute, type Session } from '../../_lib/session.js';

const CreateCartRequestSchema = z
  .object({
    mealPlanId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, 'Invalid meal plan id'),
  })
  .strict();

function credentialsAvailable(): boolean {
  const key = process.env['INSTACART_IDP_KEY'];
  return typeof key === 'string' && key.length > 0;
}

export async function POST(req: NextRequest): Promise<Response> {
  return createProtectedRoute(
    async (innerReq: NextRequest, _session: Session): Promise<Response> => {
      void _session;
      const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();

      const rawBody: unknown = await innerReq.json().catch(() => ({}));
      const parsed = CreateCartRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid cart request',
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

      if (!credentialsAvailable()) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'INSTACART_UNCONFIGURED',
              message:
                'INSTACART_IDP_KEY not configured. Set env var and allowlist api.instacart.com.',
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
      }

      return new Response(
        JSON.stringify({
          error: {
            code: 'NOT_IMPLEMENTED',
            message:
              'Instacart cart creation adapter pending (IMPL-BE-instacart-cart).',
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
