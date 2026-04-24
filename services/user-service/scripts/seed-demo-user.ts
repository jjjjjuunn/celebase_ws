// Seed a deterministic demo user + premium subscription for manual demo and E2E.
// Service boundary: user-service DB only (users, subscriptions tables).
// Idempotent: safe to run repeatedly.
//
// Output contract: writes exactly one line `USER_ID=<uuid>` to stdout on success.
// Orchestrator (scripts/seed-demo-all.sh) captures this to pass DEMO_USER_ID
// to seed-demo-plan.ts.

import pg from 'pg';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://celebbase:devpw@localhost:5432/celebbase_dev';

const DEMO_COGNITO_SUB = 'dev-demo-seed-user';
const DEMO_EMAIL = 'demo@celebbase.local';
const DEMO_DISPLAY_NAME = 'Demo User';
const SUBSCRIPTION_PERIOD_DAYS = 365;

interface UserRow {
  id: string;
}

interface SubscriptionRow {
  id: string;
}

async function upsertUser(client: pg.PoolClient): Promise<string> {
  const { rows } = await client.query<UserRow>(
    `INSERT INTO users (cognito_sub, email, display_name, subscription_tier)
     VALUES ($1, $2, $3, 'premium')
     ON CONFLICT (cognito_sub) DO UPDATE SET
       email = EXCLUDED.email,
       display_name = EXCLUDED.display_name,
       subscription_tier = 'premium',
       deleted_at = NULL,
       updated_at = NOW()
     RETURNING id`,
    [DEMO_COGNITO_SUB, DEMO_EMAIL, DEMO_DISPLAY_NAME],
  );
  const row = rows[0];
  if (!row) {
    throw new Error('Upsert returned no row');
  }
  return row.id;
}

async function upsertPremiumSubscription(
  client: pg.PoolClient,
  userId: string,
): Promise<string> {
  const { rows: existing } = await client.query<SubscriptionRow>(
    `SELECT id FROM subscriptions
     WHERE user_id = $1 AND tier = 'premium' AND status = 'active'
     LIMIT 1`,
    [userId],
  );

  const now = new Date();
  const periodEnd = new Date(
    now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );

  const existingRow = existing[0];
  if (existingRow) {
    await client.query(
      `UPDATE subscriptions
       SET current_period_start = $1,
           current_period_end = $2,
           cancel_at_period_end = FALSE,
           updated_at = NOW()
       WHERE id = $3`,
      [now, periodEnd, existingRow.id],
    );
    return existingRow.id;
  }

  const { rows } = await client.query<SubscriptionRow>(
    `INSERT INTO subscriptions (
       user_id, tier, status,
       current_period_start, current_period_end,
       cancel_at_period_end
     )
     VALUES ($1, 'premium', 'active', $2, $3, FALSE)
     RETURNING id`,
    [userId, now, periodEnd],
  );
  const row = rows[0];
  if (!row) {
    throw new Error('Subscription insert returned no row');
  }
  return row.id;
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const userId = await upsertUser(client);
    const subscriptionId = await upsertPremiumSubscription(client, userId);
    await client.query('COMMIT');

    process.stderr.write(
      `[seed-demo-user] user_id=${userId} subscription_id=${subscriptionId} email=${DEMO_EMAIL}\n`,
    );
    process.stdout.write(`USER_ID=${userId}\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    process.stderr.write(
      `[seed-demo-user] FAILED: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
