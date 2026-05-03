import type pg from 'pg';

export type RevokeReason = 'logout' | 'rotated' | 'reuse_detected';

type DbClient = pg.Pool | pg.PoolClient;

export async function insert(
  client: DbClient,
  args: { jti: string; userId: string; expiresAt: Date },
): Promise<void> {
  await client.query(
    'INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES ($1, $2, $3)',
    [args.jti, args.userId, args.expiresAt],
  );
}

// Atomic consume for rotation: mark oldJti as rotated → newJti.
// Returns true if the row was consumed (not already revoked / expired).
// Caller MUST wrap insert() + revokeForRotation() in a transaction
// and ROLLBACK on false to prevent orphan new_jti rows.
export async function revokeForRotation(
  client: DbClient,
  args: { oldJti: string; newJti: string; userId: string },
): Promise<boolean> {
  const result = await client.query(
    `UPDATE refresh_tokens
       SET revoked_at = now(), revoked_reason = 'rotated', rotated_to_jti = $1
       WHERE jti = $2 AND user_id = $3 AND revoked_at IS NULL AND expires_at > now()`,
    [args.newJti, args.oldJti, args.userId],
  );
  return (result.rowCount ?? 0) > 0;
}

// Find metadata for 401-branch analysis after a failed rotation attempt.
export async function findMetadata(
  client: DbClient,
  args: { jti: string; userId: string },
): Promise<{ revokedReason: RevokeReason | null; expiresAt: Date } | null> {
  const { rows } = await client.query<{ revoked_reason: RevokeReason | null; expires_at: Date }>(
    'SELECT revoked_reason, expires_at FROM refresh_tokens WHERE jti = $1 AND user_id = $2 LIMIT 1',
    [args.jti, args.userId],
  );
  const row = rows[0];
  if (!row) return null;
  return { revokedReason: row.revoked_reason, expiresAt: row.expires_at };
}

// Atomic single-jti logout. Returns rotated_to_jti if the token had been
// rotated forward (used to trigger chain walk), or null if it was a leaf.
// Returns null (without error) when already revoked — idempotent by design.
export async function revokeForLogout(
  client: DbClient,
  args: { jti: string; userId: string },
): Promise<{ rotatedToJti: string | null } | null> {
  const { rows, rowCount } = await client.query<{ rotated_to_jti: string | null }>(
    `UPDATE refresh_tokens
       SET revoked_at = now(), revoked_reason = 'logout'
       WHERE jti = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING rotated_to_jti`,
    [args.jti, args.userId],
  );
  if ((rowCount ?? 0) === 0) return null;
  return { rotatedToJti: rows[0]?.rotated_to_jti ?? null };
}

// Walk the rotation chain forward from startJti and revoke all unrevoked nodes.
// Uses a recursive CTE to follow rotated_to_jti links in a single statement.
export async function revokeChainForLogout(
  client: DbClient,
  args: { startJti: string; userId: string },
): Promise<number> {
  const result = await client.query(
    `WITH RECURSIVE chain(jti, rotated_to_jti) AS (
       SELECT jti, rotated_to_jti FROM refresh_tokens WHERE jti = $1
       UNION ALL
       SELECT r.jti, r.rotated_to_jti
         FROM refresh_tokens r
         JOIN chain c ON r.jti = c.rotated_to_jti
     )
     UPDATE refresh_tokens
       SET revoked_at = now(), revoked_reason = 'logout'
       WHERE jti IN (SELECT jti FROM chain)
         AND user_id = $2
         AND revoked_at IS NULL`,
    [args.startJti, args.userId],
  );
  return result.rowCount ?? 0;
}

// Revoke all active tokens for a user (reuse_detected or forced logout).
export async function revokeAllByUser(
  client: DbClient,
  args: { userId: string; reason: RevokeReason },
): Promise<number> {
  const result = await client.query(
    `UPDATE refresh_tokens
       SET revoked_at = now(), revoked_reason = $1
       WHERE user_id = $2 AND revoked_at IS NULL`,
    [args.reason, args.userId],
  );
  return result.rowCount ?? 0;
}
