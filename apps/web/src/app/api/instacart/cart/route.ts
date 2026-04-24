import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createProtectedRoute, type Session } from '../../_lib/session.js';

// Plan 22 Phase F — three modes for the Instacart cart adapter.
// `stub` (default): 503 NOT_IMPLEMENTED, preserves the pre-Plan-22 behaviour.
// `mock`: respond with a deterministic fake cart URL + id after a short delay.
// `live`: reserved for the real IDP adapter (Plan 23+); returns 503 until wired.
type AdapterMode = 'stub' | 'mock' | 'live';

function adapterMode(): AdapterMode {
  const v = process.env['INSTACART_ADAPTER_MODE'];
  if (v === 'mock' || v === 'live') return v;
  return 'stub';
}

const CartItemSchema = z
  .object({
    name: z.string().min(1),
    quantity: z.number().nonnegative(),
    unit: z.string().min(1),
  })
  .strict();

// Slot key format is "YYYY-MM-DD:meal_type". Matches PlanPreviewClient's slotKey().
const SlotKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}:[a-z_]+$/);

const CreateCartRequestSchema = z
  .object({
    meal_plan_id: z.string().uuid(),
    items: z.array(CartItemSchema).min(1).max(500),
    skipped_slots: z.array(SlotKeySchema).default([]),
  })
  .strict();

function credentialsAvailable(): boolean {
  const key = process.env['INSTACART_IDP_KEY'];
  return typeof key === 'string' && key.length > 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

async function handleMock(
  mealPlanId: string,
  itemCount: number,
  requestId: string,
): Promise<Response> {
  // 2s is the spec'd "feels real" delay (Plan 22 · Phase F verification).
  await delay(2000);
  const cartId = `cart_mock_${mealPlanId.slice(0, 8)}_${Date.now().toString(36)}`;
  return new Response(
    JSON.stringify({
      cart_id: cartId,
      cart_url: `https://www.instacart.com/cart/preview/${encodeURIComponent(cartId)}`,
      item_count: itemCount,
      mode: 'mock',
      requestId,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    },
  );
}

function unavailableResponse(
  code: string,
  message: string,
  requestId: string,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, requestId } }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    },
  );
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

      const mode = adapterMode();

      if (mode === 'mock') {
        return handleMock(parsed.data.meal_plan_id, parsed.data.items.length, requestId);
      }

      if (mode === 'live') {
        if (!credentialsAvailable()) {
          return unavailableResponse(
            'INSTACART_UNCONFIGURED',
            'INSTACART_IDP_KEY not configured. Set env var and allowlist api.instacart.com.',
            requestId,
          );
        }
        return unavailableResponse(
          'NOT_IMPLEMENTED',
          'Live Instacart adapter pending (Plan 23 · IDP contract).',
          requestId,
        );
      }

      return unavailableResponse(
        'NOT_IMPLEMENTED',
        'Instacart cart creation is in preview. Set INSTACART_ADAPTER_MODE=mock to try the mock cart.',
        requestId,
      );
    },
  )(req);
}
