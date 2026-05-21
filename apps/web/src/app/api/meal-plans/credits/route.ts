import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../_lib/bff-fetch.js';
import { createProtectedRoute, type Session } from '../../_lib/session.js';
import { toBffErrorResponse } from '../../_lib/bff-error.js';

// GET /api/meal-plans/credits — proxy meal-plan-engine's credit balance
// (IMPL-MEAL-CREDIT-001). Static segment, so Next.js matches it ahead of the
// sibling `[id]` dynamic route.
export const GET = createProtectedRoute(async (req: NextRequest, session: Session) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('meal-plan', '/meal-plans/credits', {
    method: 'GET',
    schema: schemas.MealPlanCreditsResponseSchema,
    requestId,
    forwardedFor,
    userId: session.user_id,
    authToken: session.raw_token,
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }
  return new Response(JSON.stringify(result.data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
});
