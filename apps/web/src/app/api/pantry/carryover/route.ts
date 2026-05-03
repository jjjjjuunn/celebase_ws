import { type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  schemas,
  PantryEntrySchema,
  PantryEntrySourceSchema,
  type PantryEntry,
} from '@celebbase/shared-types';
import { fetchBff } from '../../_lib/bff-fetch.js';
import { createProtectedRoute, type Session } from '../../_lib/session.js';
import { toBffErrorResponse } from '../../_lib/bff-error.js';

// Plan 22 · Phase C2 — pantry carryover fire-and-forget endpoint.
// Frontend calls this after the 4s undo window closes on a silent-skip.
// Body: { recipe_id, source, skipped_at }. We merge a new pantry entry into
// users.preferences.pantry via RFC 7396 merge-patch on user-service.
const CarryoverRequestSchema = z
  .object({
    recipe_id: PantryEntrySchema.shape.recipe_id,
    source: PantryEntrySourceSchema,
    skipped_at: PantryEntrySchema.shape.added_at.optional(),
  })
  .strict();

export const POST = createProtectedRoute(async (req: NextRequest, session: Session) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  const rawBody: unknown = await req.json().catch(() => ({}));
  const parsed = CarryoverRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid pantry carryover payload',
          requestId,
        },
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
      },
    );
  }

  // Fetch current preferences so we can append (merge-patch replaces arrays atomically).
  const current = await fetchBff('user', '/users/me', {
    method: 'GET',
    schema: schemas.UserWireSchema,
    requestId,
    userId: session.user_id,
    authToken: session.raw_token,
  });
  if (!current.ok) {
    return toBffErrorResponse(current.error, requestId);
  }

  const existingPantry = current.data.preferences?.pantry ?? [];
  const newEntry: PantryEntry = {
    recipe_id: parsed.data.recipe_id,
    added_at: parsed.data.skipped_at ?? new Date().toISOString(),
    source: parsed.data.source,
  };
  const nextPantry = [...existingPantry, newEntry];

  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('user', '/users/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ pantry: nextPantry }),
    schema: schemas.UserWireSchema,
    requestId,
    forwardedFor,
    userId: session.user_id,
    authToken: session.raw_token,
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }

  return new Response(
    JSON.stringify({ pantry: result.data.preferences?.pantry ?? [] }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    },
  );
});
