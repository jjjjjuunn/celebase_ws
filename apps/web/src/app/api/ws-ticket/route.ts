import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../_lib/bff-fetch.js';
import { createProtectedRoute, readEnv, type Session } from '../_lib/session.js';
import { toBffErrorResponse } from '../_lib/bff-error.js';

// BE (`services/user-service/src/routes/ws-ticket.routes.ts`) returns
// `{ ticket, expires_in_sec }`. The BFF composes the full
// `WsTicketResponseSchema` shape by augmenting with `meal_plan_id` (from
// request) and `ws_url` (from NEXT_PUBLIC_WS_URL allowlist) per plan D6.
const BeTicketSchema = z.object({
  ticket: z.string().min(1),
  expires_in_sec: z.number().int().positive(),
});

const WS_URL_BASE = readEnv('NEXT_PUBLIC_WS_URL');

export const POST = createProtectedRoute(async (req: NextRequest, session: Session) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;

  const rawBody: unknown = await req.json().catch(() => ({}));
  const parsedBody = schemas.WsTicketRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid ws-ticket request body',
          requestId,
        },
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
      },
    );
  }

  const result = await fetchBff('user', '/ws/ticket', {
    method: 'POST',
    body: JSON.stringify(parsedBody.data),
    schema: BeTicketSchema,
    requestId,
    forwardedFor,
    userId: session.user_id,
    authToken: session.raw_token,
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }

  const mealPlanId = parsedBody.data.meal_plan_id;
  const composed = {
    ticket: result.data.ticket,
    ws_url: `${WS_URL_BASE}/ws/meal-plans/${encodeURIComponent(mealPlanId)}/status`,
    meal_plan_id: mealPlanId,
    expires_at: new Date(Date.now() + result.data.expires_in_sec * 1_000).toISOString(),
  };

  const finalParsed = schemas.WsTicketResponseSchema.safeParse(composed);
  if (!finalParsed.success) {
    return toBffErrorResponse(
      {
        status: 502,
        code: 'BFF_CONTRACT_VIOLATION',
        message: 'Failed to compose ws-ticket response',
        requestId,
      },
      requestId,
    );
  }

  return new Response(JSON.stringify(finalParsed.data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
});
