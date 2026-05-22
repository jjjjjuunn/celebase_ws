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

    ``start_date`` and ``end_date`` are computed from ``duration_days``, which is
    also stored as ``credits_consumed`` (1 credit = 1 day). ``credits_consumed``
    is write-once: it is never updated afterward, so the per-row value is the
    source of truth for credit accounting (IMPL-MEAL-CREDIT-001).
    ``daily_plans`` defaults to an empty JSON array for the initial *queued*
    state (the AI engine fills it later).

    Accepts either a Pool or a Connection (for use within transactions).
    """

    # Consecutive-date assignment (celebrity-hopping): a new plan begins the day
    # after the user's latest scheduled plan ends, so each generation's credits
    # map 1:1 to NEW calendar days instead of piling onto the same date window
    # (FEAT-MEAL-CONSECUTIVE-DATES-001). Never schedules in the past — clamps to
    # today so a stale past plan doesn't backdate the new one.
    #
    # The filter intentionally differs from credit accounting: dates are calendar
    # slots, so a soft-deleted plan FREES its days (deleted_at IS NULL here),
    # whereas credit sums ignore deleted_at (delete = no refund of compute cost).
    #
    # Race-safety: when called from check_quota_atomic's limited path this runs
    # inside that user's pg_advisory_xact_lock, so the read-max-then-insert is
    # serialised. The unlimited admin-override path holds no lock — two concurrent
    # overrides could read the same MAX and start on the same date; admin-only and
    # rare, so accepted.
    today = datetime.now(timezone.utc).date()
    latest_end = await pool_or_conn.fetchval(
        """
        SELECT MAX(end_date)
        FROM meal_plans
        WHERE user_id = $1
          AND deleted_at IS NULL
          AND status <> 'failed'
        """,
        user_id,
    )
    start_date = (
        max(today, latest_end + timedelta(days=1)) if latest_end is not None else today
    )
    end_date = start_date + timedelta(days=duration_days - 1)

    row = await pool_or_conn.fetchrow(
        """
        INSERT INTO meal_plans
            (user_id, base_diet_id, status, preferences, start_date, end_date,
             daily_plans, idempotency_key, credits_consumed)
        VALUES ($1, $2, 'queued', $3::jsonb, $4, $5, '[]'::jsonb, $6, $7)
        RETURNING *
        """,
        user_id,
        base_diet_id,
        json.dumps(preferences),
        start_date,
        end_date,
        idempotency_key or None,
        duration_days,
    )
    return dict(row) if row else {}


async def sum_credits_lifetime(
    conn: asyncpg.Pool | asyncpg.Connection,
    user_id: str,
) -> int:
    """Sum lifetime credits consumed by *user_id* (free tier's one-time grant).

    Counts every non-failed plan regardless of ``deleted_at`` — deleting a plan
    does NOT refund its credits (anti-gaming). Only ``status = 'failed'`` plans
    are excluded (a failed generation is refunded). IMPL-MEAL-CREDIT-001.
    """

    val = await conn.fetchval(
        """
        SELECT COALESCE(SUM(credits_consumed), 0)
        FROM meal_plans
        WHERE user_id = $1
          AND status <> 'failed'
        """,
        user_id,
    )
    return int(val or 0)


async def sum_credits_this_month(
    conn: asyncpg.Pool | asyncpg.Connection,
    user_id: str,
) -> int:
    """Sum credits consumed by *user_id* in the current UTC calendar month.

    Same accounting rule as ``sum_credits_lifetime`` (deleted_at not filtered;
    only ``status = 'failed'`` excluded), scoped to the current month for paid
    tiers whose grant resets monthly. IMPL-MEAL-CREDIT-001.
    """

    val = await conn.fetchval(
        """
        SELECT COALESCE(SUM(credits_consumed), 0)
        FROM meal_plans
        WHERE user_id = $1
          AND status <> 'failed'
          AND created_at >= DATE_TRUNC('month', NOW())
          AND created_at <  DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
        """,
        user_id,
    )
    return int(val or 0)


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
    """Return meal plans newest-first with cursor-based pagination.

    Ordered by ``created_at DESC`` (not ``id``): meal_plans ids are random
    UUIDv4, so id ordering is arbitrary — the calendar needs the most recent
    plans (which cover today→future under consecutive-date scheduling) on the
    first page. The cursor is the last row's ``created_at`` ISO timestamp.
    Fetches ``limit + 1`` rows so the caller can derive ``has_next``.
    """

    if cursor is not None:
        rows = await pool.fetch(
            """
            SELECT * FROM meal_plans
            WHERE user_id = $1 AND created_at < $2::timestamptz AND deleted_at IS NULL
            ORDER BY created_at DESC
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
            ORDER BY created_at DESC
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

    allowed_columns = {
        "status",
        "daily_plans",
        "adjustments",
        "name",
        "start_date",
        "end_date",
    }
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
        SET {", ".join(set_parts)}
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
