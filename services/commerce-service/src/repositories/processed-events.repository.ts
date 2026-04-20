import type pg from 'pg';

export interface ProcessedEvent {
  id: string;
  stripe_event_id: string;
  event_type: string;
  processed_at: Date;
  payload_hash: string;
  result: 'applied' | 'skipped' | 'error';
  error_message: string | null;
}

interface MarkProcessedParams {
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
  const { stripeEventId, eventType, payloadHash, result, errorMessage } = params;
  const { rowCount } = await pool.query(
    `INSERT INTO processed_events (stripe_event_id, event_type, payload_hash, result, error_message)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (stripe_event_id) DO NOTHING`,
    [stripeEventId, eventType, payloadHash, result, errorMessage ?? null],
  );
  return { inserted: rowCount === 1 };
}

export async function findByEventId(
  pool: pg.Pool,
  stripeEventId: string,
): Promise<ProcessedEvent | null> {
  const { rows } = await pool.query<ProcessedEvent>(
    'SELECT * FROM processed_events WHERE stripe_event_id = $1 LIMIT 1',
    [stripeEventId],
  );
  return rows[0] ?? null;
}
