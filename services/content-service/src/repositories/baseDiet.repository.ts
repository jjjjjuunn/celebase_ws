import type pg from 'pg';
import type { BaseDiet } from '@celebbase/shared-types';

export async function findById(pool: pg.Pool, id: string): Promise<BaseDiet | null> {
  const { rows } = await pool.query<BaseDiet>(
    'SELECT * FROM base_diets WHERE id = $1 AND is_active = TRUE LIMIT 1',
    [id],
  );
  return rows[0] ?? null;
}

export async function findByCelebrityId(pool: pg.Pool, celebrityId: string): Promise<BaseDiet[]> {
  const { rows } = await pool.query<BaseDiet>(
    'SELECT * FROM base_diets WHERE celebrity_id = $1 AND is_active = TRUE ORDER BY version DESC',
    [celebrityId],
  );
  return rows;
}
