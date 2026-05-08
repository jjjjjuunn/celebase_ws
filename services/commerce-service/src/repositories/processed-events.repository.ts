import type pg from 'pg';

export type EventProvider = 'stripe' | 'revenuecat';

export interface ProcessedEvent {
  id: string;
  stripe_event_id: string; // legacy column kept until phase 2
  event_type: string;
  processed_at: Date;
  payload_hash: string;
  result: 'applied' | 'skipped' | 'error';
  error_message: string | null;
  provider: EventProvider | null; // new, nullable in phase 1a
  event_id: string | null; // new, nullable in phase 1a
}

interface MarkProcessedParams {
  provider: EventProvider;
  eventId: string;
  /**
   * Stripe compatibility column. When provider === 'stripe',
   * this must be the same value as eventId.
   */
  stripeEventId: string;
  eventType: string;
  payloadHash: string;
  result: 'applied' | 'skipped' | 'error';
  errorMessage?: string;
}

interface MarkProcessedResult {
  inserted: boolean;
}

export async function markProcessed(
  pool: pg.Pool,
  params: MarkProcessedParams,
): Promise<MarkProcessedResult> {
  const { provider, eventId, stripeEventId, eventType, payloadHash, result, errorMessage } = params;
  // Provider-aware conflict target. Stripe rows still rely on the legacy
  // stripe_event_id UNIQUE column for backward compatibility (phase 1a-1).
  // Other providers use the partial UNIQUE index on (provider, event_id) added in 1a-2.
  const conflictTarget = provider === 'stripe' ? '(stripe_event_id)' : '(provider, event_id)';
  const { rowCount } = await pool.query(
    `INSERT INTO processed_events
       (stripe_event_id, event_type, payload_hash, result, error_message, provider, event_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT ${conflictTarget} DO NOTHING`,
    [stripeEventId, eventType, payloadHash, result, errorMessage ?? null, provider, eventId],
  );
  return { inserted: rowCount === 1 };
}

type FindByEventIdParams =
  | { provider: EventProvider; eventId: string }
  | { stripeEventId: string };

export async function findByEventId(
  pool: pg.Pool,
  params: FindByEventIdParams,
): Promise<ProcessedEvent | null> {
  if ('provider' in params) {
    // New lookup using provider + event_id.
    const { rows } = await pool.query<ProcessedEvent>(
      'SELECT * FROM processed_events WHERE provider = $1 AND event_id = $2 LIMIT 1',
      [params.provider, params.eventId],
    );
    if (rows[0]) return rows[0];
    // Fallback for Stripe only — legacy rows written before phase 1a.
    if (params.provider === 'stripe') {
      const fallback = await pool.query<ProcessedEvent>(
        'SELECT * FROM processed_events WHERE stripe_event_id = $1 LIMIT 1',
        [params.eventId],
      );
      return fallback.rows[0] ?? null;
    }
    return null;
  }

  // Legacy lookup by stripe_event_id (string overload kept via object form).
  const { rows } = await pool.query<ProcessedEvent>(
    'SELECT * FROM processed_events WHERE stripe_event_id = $1 LIMIT 1',
    [params.stripeEventId],
  );
  return rows[0] ?? null;
}
