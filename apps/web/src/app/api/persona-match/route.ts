import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createProtectedRoute, type Session } from '../_lib/session.js';

const PersonaMatchRequestSchema = z
  .object({
    celebritySlug: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'invalid celebrity slug'),
    goal: z.enum(['weight_loss', 'muscle_gain', 'recovery', 'longevity', 'general']),
    wellnessKeywords: z.array(z.string().max(40)).max(10).optional(),
  })
  .strict();

const PHI_KEYS = new Set([
  'bioProfile',
  'biomarkers',
  'medications',
  'medicalConditions',
  'age',
  'weightKg',
  'heightCm',
  'sex',
]);

function rejectPhiExposure(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (PHI_KEYS.has(key)) return key;
  }
  return null;
}

export async function POST(req: NextRequest): Promise<Response> {
  return createProtectedRoute(
    async (innerReq: NextRequest, _session: Session): Promise<Response> => {
      void _session;
      const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();
      const rawBody: unknown = await innerReq.json().catch(() => ({}));

      const phiKey = rejectPhiExposure(rawBody);
      if (phiKey !== null) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'PHI_EXPOSURE',
              message: `Field "${phiKey}" must not be sent by client. PHI is resolved server-side.`,
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

      const parsed = PersonaMatchRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid persona-match request',
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
              'analytics-service /internal/persona-match is not yet available (IMPL-BE-analytics-persona-match pending).',
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
