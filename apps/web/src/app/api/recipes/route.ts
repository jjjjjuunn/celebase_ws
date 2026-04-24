import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../_lib/bff-fetch.js';
import { createPublicRoute } from '../_lib/session.js';
import { toBffErrorResponse } from '../_lib/bff-error.js';

export const GET = createPublicRoute(async (req: NextRequest) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const search = req.nextUrl.search;
  const result = await fetchBff('content', `/recipes${search}`, {
    method: 'GET',
    schema: schemas.RecipeListResponseSchema,
    requestId,
    forwardedFor,
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }
  return new Response(JSON.stringify(result.data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
});
