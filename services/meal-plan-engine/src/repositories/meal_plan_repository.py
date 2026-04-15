"""Repository layer for meal_plans table.

All queries use parameterized placeholders ($1, $2, …) — no string
concatenation.  UUIDs are generated via the ``uuid7`` package.
Soft-delete is enforced by filtering ``deleted_at IS NULL``.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import asyncpg

_logger = logging.getLogger(__name__)


async def create_meal_plan(
    pool_or_conn: asyncpg.Pool | asyncpg.Connection,
    user_id: str,
    base_diet_id: str,
    duration_days: int,
    preferences: Dict[str, Any],
    idempotency_key: str = "",
) -> Dict[str, Any]:
    """Insert a new meal plan with status ``queued``.

    ``duration_days`` is not stored — ``start_date`` and ``end_date`` are
    computed from it.  ``daily_plans`` defaults to an empty JSON array for
    the initial *queued* state (the AI engine fills it later).

    Accepts either a Pool or a Connection (for use within transactions).
    """

    start_date = datetime.now(timezone.utc).date()
    end_date = start_date + timedelta(days=duration_days - 1)

    row = await pool_or_conn.fetchrow(
        """
        INSERT INTO meal_plans
            (user_id, base_diet_id, status, preferences, start_date, end_date,
             daily_plans, idempotency_key)
        VALUES ($1, $2, 'queued', $3::jsonb, $4, $5, '[]'::jsonb, $6)
        RETURNING *
        """,
        user_id,
        base_diet_id,
        json.dumps(preferences),
        start_date,
        end_date,
        idempotency_key or None,
    )
    return dict(row) if row else {}


async def count_plans_this_month(
    conn: asyncpg.Pool | asyncpg.Connection,
    user_id: str,
) -> int:
    """Count non-failed, non-deleted plans for *user_id* in the current UTC month."""

    val = await conn.fetchval(
        """
        SELECT COUNT(*)
        FROM meal_plans
        WHERE user_id = $1
          AND status <> 'failed'
          AND deleted_at IS NULL
          AND created_at >= DATE_TRUNC('month', NOW())
          AND created_at <  DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
        """,
        user_id,
    )
    return val or 0


async def find_recent_duplicate(
    pool: asyncpg.Pool,
    user_id: str,
    idempotency_key: str,
    within_minutes: int = 5,
) -> Optional[Dict[str, Any]]:
    """Find a recent plan with the same idempotency key (5-min dedup window)."""

    row = await pool.fetchrow(
        """
        SELECT * FROM meal_plans
        WHERE user_id = $1
          AND idempotency_key = $2
          AND created_at >= NOW() - ($3 * INTERVAL '1 minute')
          AND deleted_at IS NULL
          AND status <> 'failed'
        ORDER BY created_at DESC
        LIMIT 1
        """,
        user_id,
        idempotency_key,
        within_minutes,
    )
    return dict(row) if row else None


async def get_meal_plan(
    pool: asyncpg.Pool,
    plan_id: str,
    user_id: str,
) -> Optional[Dict[str, Any]]:
    """Fetch a single meal plan owned by *user_id*."""

    row = await pool.fetchrow(
        """
        SELECT * FROM meal_plans
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        """,
        plan_id,
        user_id,
    )
    return dict(row) if row else None


async def list_meal_plans(
    pool: asyncpg.Pool,
    user_id: str,
    cursor: Optional[str],
    limit: int,
) -> List[Dict[str, Any]]:
    """Return meal plans with cursor-based pagination.

    Fetches ``limit + 1`` rows so the caller can derive ``has_next``.
    """

    if cursor is not None:
        rows = await pool.fetch(
            """
            SELECT * FROM meal_plans
            WHERE user_id = $1 AND id > $2 AND deleted_at IS NULL
            ORDER BY id ASC
            LIMIT $3
            """,
            user_id,
            cursor,
            limit + 1,
        )
    else:
        rows = await pool.fetch(
            """
            SELECT * FROM meal_plans
            WHERE user_id = $1 AND deleted_at IS NULL
            ORDER BY id ASC
            LIMIT $2
            """,
            user_id,
            limit + 1,
        )
    return [dict(r) for r in rows]


async def update_meal_plan(
    pool: asyncpg.Pool,
    plan_id: str,
    user_id: str,
    updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Apply a partial update to a meal plan.

    Only keys present in *updates* are written.  The function builds
    parameterized SET clauses dynamically — no string interpolation of
    user data.
    """

    if not updates:
        return await get_meal_plan(pool, plan_id, user_id)

    allowed_columns = {"status", "daily_plans", "adjustments", "name", "start_date", "end_date"}
    filtered = {k: v for k, v in updates.items() if k in allowed_columns}
    if not filtered:
        return await get_meal_plan(pool, plan_id, user_id)

    set_parts: list[str] = []
    values: list[Any] = []
    idx = 1

    for col, val in filtered.items():
        if col in ("daily_plans", "adjustments"):
            set_parts.append(f"{col} = ${idx}::jsonb")
            values.append(json.dumps(val) if not isinstance(val, str) else val)
        else:
            set_parts.append(f"{col} = ${idx}")
            values.append(val)
        idx += 1

    set_parts.append("updated_at = NOW()")

    values.append(plan_id)
    values.append(user_id)

    sql = f"""
        UPDATE meal_plans
        SET {', '.join(set_parts)}
        WHERE id = ${idx} AND user_id = ${idx + 1} AND deleted_at IS NULL
        RETURNING *
    """

    row = await pool.fetchrow(sql, *values)
    return dict(row) if row else None


async def archive_meal_plan(
    pool: asyncpg.Pool,
    plan_id: str,
    user_id: str,
) -> bool:
    """Soft-delete a meal plan by setting ``deleted_at``."""

    result = await pool.execute(
        """
        UPDATE meal_plans
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        """,
        plan_id,
        user_id,
    )
    return result == "UPDATE 1"
