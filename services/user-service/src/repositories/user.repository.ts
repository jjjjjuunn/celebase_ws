import type pg from 'pg';
import type { User } from '@celebbase/shared-types';

export async function findById(pool: pg.Pool, id: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    'SELECT * FROM users WHERE id = $1 LIMIT 1',
    [id],
  );
  return rows[0] ?? null;
}

// Same query as findById, but accepts a PoolClient so it participates in the
// caller's transaction (used by performRotation's ACCOUNT_DELETED gate to
// serialize against a concurrent DELETE /users/me).
export async function findByIdInTx(
  client: pg.PoolClient,
  id: string,
): Promise<User | null> {
  const { rows } = await client.query<User>(
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
  preferred_celebrity_slug?: string | null | undefined;
};

const ALLOWED_USER_COLUMNS: ReadonlySet<string> = new Set<string>([
  'display_name', 'avatar_url', 'locale', 'timezone', 'preferred_celebrity_slug',
]);

export async function updateUser(
  pool: pg.Pool,
  id: string,
  data: UpdateableUserFields,
): Promise<User> {
  const rawKeys = Object.keys(data);
  const fields = rawKeys.filter((k) => ALLOWED_USER_COLUMNS.has(k)) as Array<keyof UpdateableUserFields>;
  if (fields.length !== rawKeys.length) {
    throw new Error('Unexpected column in update payload');
  }
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

export async function findByCognitoSub(pool: pg.Pool, cognitoSub: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    'SELECT * FROM users WHERE cognito_sub = $1 LIMIT 1',
    [cognitoSub],
  );
  return rows[0] ?? null;
}

/**
 * Email-bridge for day-1 Cognito cutover: atomically replace a dev-seeded
 * cognito_sub (`dev-%`) with the real Cognito sub keyed on email.
 * Returns null if no matching dev-seeded row exists (concurrent race safe —
 * only one caller wins the UPDATE).
 */
export async function findAndUpdateCognitoSubByEmail(
  pool: pg.Pool,
  email: string,
  cognitoSub: string,
): Promise<User | null> {
  try {
    const { rows } = await pool.query<User>(
      `UPDATE users
         SET cognito_sub = $1, updated_at = NOW()
       WHERE email = $2 AND cognito_sub LIKE 'dev-%'
       RETURNING *`,
      [cognitoSub, email],
    );
    return rows[0] ?? null;
  } catch (err: unknown) {
    // PG unique_violation on cognito_sub — another row already claimed this sub
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return null;
    }
    throw err;
  }
}

type CreateUserData = {
  cognito_sub: string;
  email: string;
  display_name: string;
};

export async function create(pool: pg.Pool, data: CreateUserData): Promise<User | null> {
  try {
    const { rows } = await pool.query<User>(
      `INSERT INTO users (cognito_sub, email, display_name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.cognito_sub, data.email, data.display_name],
    );
    return rows[0] ?? null;
  } catch (err: unknown) {
    // PG unique_violation (email or cognito_sub) → null signals conflict
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return null;
    }
    throw err;
  }
}

export async function softDelete(pool: pg.Pool, id: string): Promise<void> {
  await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [id]);
}

/**
 * Plan 22-vast-adleman · Phase C1 — RFC 7396 merge-patch on users.preferences.
 *
 * Uses jsonb concat (`||`) so existing top-level keys outside the patch are
 * preserved. Caller is responsible for Zod-validating `patch` before invoking.
 */
export async function mergePreferences(
  pool: pg.Pool,
  userId: string,
  patch: Record<string, unknown>,
): Promise<User> {
  const { rows } = await pool.query<User>(
    `UPDATE users
       SET preferences = preferences || $1::jsonb,
           updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [JSON.stringify(patch), userId],
  );
  const row = rows[0];
  if (!row) throw new Error('User not found after preferences merge');
  return row;
}

/**
 * Update only subscription_tier — kept separate from ALLOWED_USER_COLUMNS
 * to prevent client-facing PATCH from modifying this column.
 * Accepts Pool or PoolClient for use within transactions.
 */
export async function updateSubscriptionTier(
  client: pg.Pool | pg.PoolClient,
  userId: string,
  tier: 'free' | 'premium' | 'elite',
): Promise<void> {
  await client.query(
    'UPDATE users SET subscription_tier = $1, updated_at = NOW() WHERE id = $2',
    [tier, userId],
  );
}
