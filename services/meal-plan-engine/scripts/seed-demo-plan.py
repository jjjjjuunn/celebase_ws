# Seed a pre-generated 7-day completed meal plan for the demo user.
# Service boundary: meal-plan-engine DB only (meal_plans table).
# Reads base_diets via SELECT (read-only cross-service read is allowed for
# seed fixtures; write is isolated to meal_plans).
#
# Input contract: requires DEMO_USER_ID env var (set by orchestrator from
# seed-demo-user.ts stdout). Falls back to cognito_sub lookup if unset.
# Exits 1 if user not found or base_diets empty.
# Idempotent: upserts on (user_id, name) by checking existing demo plan.

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import UTC, date, datetime, timedelta
from typing import Any, cast

import asyncpg

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://celebbase:devpw@localhost:5432/celebbase_dev",
)

DEMO_USER_ID = os.environ.get("DEMO_USER_ID")
DEMO_COGNITO_SUB_FALLBACK = "dev-demo-seed-user"
DEMO_PLAN_NAME = "Demo 7-Day Plan"
DURATION_DAYS = 7


def iso_date(offset_days: int) -> str:
    return day_date(offset_days).isoformat()


def day_date(offset_days: int) -> date:
    d = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    d = d + timedelta(days=offset_days)
    return d.date()


def build_daily_plans() -> list[dict[str, Any]]:
    meals: list[dict[str, Any]] = [
        {
            "meal_type": "breakfast",
            "recipe_id": None,
            "title": "Greek Yogurt Parfait",
            "kcal": 350,
            "protein_g": 25,
            "carbs_g": 40,
            "fat_g": 10,
        },
        {
            "meal_type": "lunch",
            "recipe_id": None,
            "title": "Grilled Chicken Quinoa Bowl",
            "kcal": 550,
            "protein_g": 42,
            "carbs_g": 55,
            "fat_g": 18,
        },
        {
            "meal_type": "dinner",
            "recipe_id": None,
            "title": "Baked Salmon with Roasted Vegetables",
            "kcal": 600,
            "protein_g": 40,
            "carbs_g": 35,
            "fat_g": 28,
        },
        {
            "meal_type": "snack",
            "recipe_id": None,
            "title": "Almonds and Apple",
            "kcal": 200,
            "protein_g": 6,
            "carbs_g": 25,
            "fat_g": 10,
        },
    ]
    totals: dict[str, int] = {"kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}
    for m in meals:
        for k in totals:
            totals[k] += cast(int, m[k])

    return [
        {
            "day": i + 1,
            "date": iso_date(i),
            "meals": meals,
            "totals": totals,
        }
        for i in range(DURATION_DAYS)
    ]


async def resolve_user_id(conn: asyncpg.Connection) -> str:
    if DEMO_USER_ID:
        row = await conn.fetchrow(
            "SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
            DEMO_USER_ID,
        )
        if row is None:
            raise RuntimeError(
                f"DEMO_USER_ID={DEMO_USER_ID} not found in users table (or soft-deleted)",
            )
        return str(row["id"])

    row = await conn.fetchrow(
        """
        SELECT id FROM users
        WHERE cognito_sub = $1 AND deleted_at IS NULL
        LIMIT 1
        """,
        DEMO_COGNITO_SUB_FALLBACK,
    )
    if row is None:
        raise RuntimeError(
            "DEMO_USER_ID env var not set and no fallback demo user found. "
            "Run seed-demo-user.ts first.",
        )
    return str(row["id"])


async def resolve_base_diet_id(conn: asyncpg.Connection) -> str:
    row = await conn.fetchrow(
        """
        SELECT id FROM base_diets
        WHERE is_active = TRUE
        ORDER BY created_at ASC
        LIMIT 1
        """,
    )
    if row is None:
        raise RuntimeError(
            "No active base_diets found. Run `pnpm --filter @celebbase/db seed` first.",
        )
    return str(row["id"])


async def upsert_demo_plan(
    conn: asyncpg.Connection,
    user_id: str,
    base_diet_id: str,
) -> str:
    daily_plans = build_daily_plans()
    daily_plans_json = json.dumps(daily_plans)
    start_date = day_date(0)
    end_date = day_date(DURATION_DAYS - 1)

    existing = await conn.fetchrow(
        """
        SELECT id FROM meal_plans
        WHERE user_id = $1 AND name = $2 AND deleted_at IS NULL
        LIMIT 1
        """,
        user_id,
        DEMO_PLAN_NAME,
    )

    if existing is not None:
        await conn.execute(
            """
            UPDATE meal_plans
            SET base_diet_id = $1,
                status = 'completed',
                start_date = $2,
                end_date = $3,
                daily_plans = $4::jsonb,
                updated_at = NOW()
            WHERE id = $5
            """,
            base_diet_id,
            start_date,
            end_date,
            daily_plans_json,
            existing["id"],
        )
        return str(existing["id"])

    row = await conn.fetchrow(
        """
        INSERT INTO meal_plans (
            user_id, base_diet_id, name, status,
            start_date, end_date, daily_plans
        )
        VALUES ($1, $2, $3, 'completed', $4, $5, $6::jsonb)
        RETURNING id
        """,
        user_id,
        base_diet_id,
        DEMO_PLAN_NAME,
        start_date,
        end_date,
        daily_plans_json,
    )
    if row is None:
        raise RuntimeError("meal_plans insert returned no row")
    return str(row["id"])


async def main() -> None:
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        async with conn.transaction():
            user_id = await resolve_user_id(conn)
            base_diet_id = await resolve_base_diet_id(conn)
            plan_id = await upsert_demo_plan(conn, user_id, base_diet_id)

        sys.stderr.write(
            f"[seed-demo-plan] plan_id={plan_id} user_id={user_id} "
            f"base_diet_id={base_diet_id} status=completed days={DURATION_DAYS}\n",
        )
        sys.stdout.write(f"PLAN_ID={plan_id}\n")
    finally:
        await conn.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:  # noqa: BLE001 — top-level script reporter
        sys.stderr.write(f"[seed-demo-plan] FAILED: {err}\n")
        sys.exit(1)
