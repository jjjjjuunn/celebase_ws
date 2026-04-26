'use client';

import { useEffect, useRef, useState } from 'react';
import { schemas } from '@celebbase/shared-types';
import { fetcher, postJson } from './fetcher.js';

// WS event protocol — wire-only, not in shared-types
type WsStreamEvent =
  | { type: 'progress'; pct: number; message: string }
  | { type: 'complete'; meal_plan_id: string }
  | { type: 'error'; code: string; message: string };

export type MealPlanStreamStatus = 'idle' | 'connecting' | 'streaming' | 'success' | 'error';

export interface MealPlanStreamState {
  status: MealPlanStreamStatus;
  progressPct: number;
  message: string;
  error: string | null;
  completedMealPlanId: string | null;
}

export interface StreamCallbacks {
  onConnecting: () => void;
  onStreaming: () => void;
  onProgress: (pct: number, message: string) => void;
  onComplete: (mealPlanId: string) => void;
  onError: (message: string) => void;
}

const INITIAL_STATE: MealPlanStreamState = {
  status: 'idle',
  progressPct: 0,
  message: '',
  error: null,
  completedMealPlanId: null,
};

// Exported for unit testing. Opens a WS stream for the given mealPlanId.
// Fetches a short-lived ticket from the BFF then connects to the WS URL.
// Returns the WebSocket instance (or null if aborted/failed before connection).
export async function openMealPlanStream(
  mealPlanId: string,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
): Promise<WebSocket | null> {
  callbacks.onConnecting();

  let ticketData: schemas.WsTicketResponse;
  try {
    ticketData = await postJson<schemas.WsTicketResponse>(
      '/api/meal-plans/ws-ticket',
      { meal_plan_id: mealPlanId },
      { schema: schemas.WsTicketResponseSchema, signal },
    );
  } catch (err: unknown) {
    if (!signal.aborted) {
      callbacks.onError(err instanceof Error ? err.message : 'Failed to get stream ticket');
    }
    return null;
  }

  if (signal.aborted) return null;

  const ws = new WebSocket(`${ticketData.ws_url}?ticket=${encodeURIComponent(ticketData.ticket)}`);

  // settled prevents multiple terminal callbacks (onComplete / onError) from firing
  let settled = false;
  const settle = (cb: () => void): void => {
    if (!settled) {
      settled = true;
      cb();
    }
  };

  ws.addEventListener('open', () => {
    if (!signal.aborted) callbacks.onStreaming();
  });

  ws.addEventListener('message', (event: MessageEvent) => {
    if (signal.aborted || settled) return;
    let parsed: WsStreamEvent;
    try {
      parsed = JSON.parse(String(event.data)) as WsStreamEvent;
    } catch {
      return;
    }
    if (parsed.type === 'progress') {
      callbacks.onProgress(parsed.pct, parsed.message);
    } else if (parsed.type === 'complete') {
      settle(() => callbacks.onComplete(parsed.meal_plan_id));
      ws.close();
    } else if (parsed.type === 'error') {
      settle(() => callbacks.onError(parsed.message));
      ws.close();
    }
  });

  ws.addEventListener('error', () => {
    if (!signal.aborted) settle(() => callbacks.onError('WebSocket connection error'));
  });

  ws.addEventListener('close', (event: CloseEvent) => {
    if (signal.aborted) return;
    if (!event.wasClean) {
      settle(() => callbacks.onError('Connection lost unexpectedly'));
    }
  });

  return ws;
}

const POLL_INTERVAL_MS = 2000;

async function pollMealPlanStatus(
  mealPlanId: string,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
): Promise<void> {
  let fakeProgress = 10;

  const tick = async (): Promise<void> => {
    if (signal.aborted) return;

    let plan: schemas.MealPlanDetailResponse;
    try {
      plan = await fetcher(`/api/meal-plans/${mealPlanId}`, {
        schema: schemas.MealPlanDetailResponseSchema,
        signal,
      });
    } catch {
      if (!signal.aborted) callbacks.onError('Failed to check meal plan status');
      return;
    }

    if (signal.aborted) return;

    if (plan.status === 'queued' || plan.status === 'generating') {
      callbacks.onStreaming();
      fakeProgress = Math.min(fakeProgress + 15, 85);
      callbacks.onProgress(fakeProgress, 'Generating your plan…');
      setTimeout(() => void tick(), POLL_INTERVAL_MS);
    } else if (plan.status === 'draft' || plan.status === 'completed' || plan.status === 'active') {
      callbacks.onComplete(plan.id);
    } else {
      callbacks.onError('Meal plan generation failed');
    }
  };

  await tick();
}

export function useMealPlanStream(mealPlanId: string | null): MealPlanStreamState {
  const [state, setState] = useState<MealPlanStreamState>(INITIAL_STATE);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!mealPlanId) {
      setState(INITIAL_STATE);
      return;
    }

    const abort = new AbortController();
    let fellBack = false;

    const baseCallbacks: StreamCallbacks = {
      onConnecting: () =>
        setState({ status: 'connecting', progressPct: 0, message: '', error: null, completedMealPlanId: null }),
      onStreaming: () =>
        setState((prev) => ({ ...prev, status: 'streaming' })),
      onProgress: (pct, message) =>
        setState((prev) => ({ ...prev, progressPct: pct, message })),
      onComplete: (id) =>
        setState({ status: 'success', progressPct: 100, message: '', error: null, completedMealPlanId: id }),
      onError: (error) =>
        setState({ status: 'error', progressPct: 0, message: '', error, completedMealPlanId: null }),
    };

    // Intercept WS errors to fall back to polling before surfacing to UI
    const wsCallbacks: StreamCallbacks = {
      ...baseCallbacks,
      onError: (error) => {
        if (!fellBack && !abort.signal.aborted) {
          fellBack = true;
          baseCallbacks.onConnecting();
          void pollMealPlanStatus(mealPlanId, baseCallbacks, abort.signal);
        } else if (!abort.signal.aborted) {
          baseCallbacks.onError(error);
        }
      },
    };

    void openMealPlanStream(mealPlanId, wsCallbacks, abort.signal).then((ws) => {
      if (ws) wsRef.current = ws;
    });

    return () => {
      abort.abort();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [mealPlanId]);

  return state;
}
