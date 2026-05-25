import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../_lib/bff-fetch.js';
import { createPublicRoute } from '../../_lib/session.js';
import { toBffErrorResponse } from '../../_lib/bff-error.js';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return createPublicRoute(async (innerReq: NextRequest) => {
    const requestId = innerReq.headers.get('x-request-id') ?? crypto.randomUUID();
    const forwardedFor = innerReq.headers.get('x-forwarded-for') ?? undefined;
    const result = await fetchBff('content', `/recipes/${encodeURIComponent(id)}`, {
      method: 'GET',
      schema: schemas.RecipeDetailContentSchema,
      requestId,
      forwardedFor,
    });
    if (!result.ok) {
      return toBffErrorResponse(result.error, requestId);
    }
    // Map the nested recipe_ingredients join → lean, sorted `ingredients` array,
    // and drop the join from the recipe payload (mobile parses RecipeDetailResponse).
    const { recipe_ingredients, ...recipe } = result.data;
    const ingredients = [...(recipe_ingredients ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ri) => ({
        name: ri.ingredient.name,
        quantity: ri.quantity,
        unit: ri.unit,
        preparation: ri.preparation ?? null,
        is_optional: ri.is_optional,
      }));
    return new Response(JSON.stringify({ recipe, ingredients }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    });
  })(req);
}
