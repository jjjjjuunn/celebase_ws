import type pg from 'pg';
import type { User } from '@celebbase/shared-types';

export async function findById(pool: pg.Pool, id: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    'SELECT * FROM users WHERE id = $1 LIMIT 1',
    [id],
  );
  return rows[0] ?? null;
}

export async function findByEmail(pool: pg.Pool, email: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    'SELECT * FROM users WHERE email = $1 LIMIT 1',
    [email],
  );
  return rows[0] ?? null;
}

type UpdateableUserFields = {
  display_name?: string | undefined;
  avatar_url?: string | null | undefined;
  locale?: string | undefined;
  timezone?: string | undefined;
};

export async function updateUser(
  pool: pg.Pool,
  id: string,
  data: UpdateableUserFields,
): Promise<User> {
  const fields = Object.keys(data) as Array<keyof UpdateableUserFields>;
  if (fields.length === 0) {
    const existing = await findById(pool, id);
    if (!existing) throw new Error('User not found');
    return existing;
  }

  const setClauses = fields.map((f, idx) => `${f} = $${String(idx + 2)}`).join(', ');
  const values: unknown[] = [...fields.map((k) => data[k]), id];

  const { rows } = await pool.query<User>(
    `UPDATE users SET ${setClauses}, updated_at = NOW() WHERE id = $${String(fields.length + 2)} RETURNING *`,
    values,
  );
  const row = rows[0];
  if (!row) throw new Error('User not found after update');
  return row;
}

export async function softDelete(pool: pg.Pool, id: string): Promise<void> {
  await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [id]);
}
