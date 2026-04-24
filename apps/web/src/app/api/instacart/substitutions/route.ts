import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createProtectedRoute, type Session } from '../../_lib/session.js';

const SubstitutionDecisionSchema = z
  .object({
    orderId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, 'Invalid orderId'),
    lineItemId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, 'Invalid lineItemId'),
    decision: z.enum(['approve', 'reject']),
    substitutionOptionId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, 'Invalid substitutionOptionId')
      .optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.decision === 'reject' ||
      (data.decision === 'approve' && data.substitutionOptionId !== undefined),
    { message: 'substitutionOptionId is required when decision=approve' },
  );

export async function POST(req: NextRequest): Promise<Response> {
  return createProtectedRoute(
    async (innerReq: NextRequest, _session: Session): Promise<Response> => {
      void _session;
      const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();

      const rawBody: unknown = await innerReq.json().catch(() => ({}));
      const parsed = SubstitutionDecisionSchema.safeParse(rawBody);
      if (!parsed.success) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid substitution decision payload',
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
            message: 'Instacart substitution decision adapter pending.',
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
