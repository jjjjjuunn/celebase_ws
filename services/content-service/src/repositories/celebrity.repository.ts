import type pg from 'pg';
import type { Celebrity } from '@celebbase/shared-types';

export interface ListCelebritiesOptions {
  category?: string | undefined;
  featured?: boolean | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export interface ListResult<T> {
  items: T[];
  has_next: boolean;
  next_cursor: string | null;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function findBySlug(pool: pg.Pool, slug: string): Promise<Celebrity | null> {
  const { rows } = await pool.query<Celebrity>(
    'SELECT * FROM celebrities WHERE slug = $1 AND is_active = TRUE LIMIT 1',
    [slug],
  );
  return rows[0] ?? null;
}

export async function findById(pool: pg.Pool, id: string): Promise<Celebrity | null> {
  const { rows } = await pool.query<Celebrity>(
    'SELECT * FROM celebrities WHERE id = $1 AND is_active = TRUE LIMIT 1',
    [id],
  );
  return rows[0] ?? null;
}

export async function list(
  pool: pg.Pool,
  opts: ListCelebritiesOptions,
): Promise<ListResult<Celebrity>> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  const whereClauses: string[] = ['is_active = TRUE'];
  const values: unknown[] = [];

  if (opts.category !== undefined) {
    values.push(opts.category);
    whereClauses.push(`category = $${String(values.length)}`);
  }
  if (opts.featured !== undefined) {
    values.push(opts.featured);
    whereClauses.push(`is_featured = $${String(values.length)}`);
  }
  if (opts.cursor !== undefined) {
    values.push(opts.cursor);
    whereClauses.push(`id > $${String(values.length)}`);
  }

  values.push(limit + 1);
  const limitParam = `$${String(values.length)}`;

  const sql = `SELECT * FROM celebrities WHERE ${whereClauses.join(' AND ')} ORDER BY sort_order ASC, id ASC LIMIT ${limitParam}`;

  const { rows } = await pool.query<Celebrity>(sql, values);

  const hasNext = rows.length > limit;
  const items = rows.slice(0, limit);
  const nextCursor = hasNext ? (items[items.length - 1]?.id ?? null) : null;

  return { items, has_next: hasNext, next_cursor: nextCursor };
}

/**
 * Admin: deactivate a celebrity (spec §9.3 #3, IMPL-021).
 *
 * Sets `is_active = FALSE`. A DB trigger
 * (`trg_celebrities_deactivate_cascade_claims`, migration 0015) cascades
 * the change to `lifestyle_claims` by archiving any rows with
 * `status = 'published'` for this celebrity.
 *
 * Idempotent: returns null if the celebrity does not exist OR is already
 * inactive (the WHERE clause filters on `is_active = TRUE`).
 */
export async function deactivate(pool: pg.Pool, id: string): Promise<Celebrity | null> {
  const { rows } = await pool.query<Celebrity>(
    `UPDATE celebrities
     SET is_active = FALSE, updated_at = NOW()
     WHERE id = $1 AND is_active = TRUE
     RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}
