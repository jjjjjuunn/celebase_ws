"""Repository layer for meal_plans table (phase 004-a).

The concrete SQL is intentionally deferred until IMPL-004-b/004-c; for this
phase tests will monkey-patch these coroutine functions. Implementations raise
``NotImplementedError`` to ensure accidental usage is obvious during manual
testing, while staying patch-friendly for unit tests.
"""

from __future__ import annotations

from typing import Any, List, Dict, Optional

import asyncpg  # noqa: F401  # imported for typing purposes


async def create_meal_plan(
    pool: "asyncpg.Pool",
    user_id: str,
    base_diet_id: str,
    duration_days: int,
    preferences: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a new queued meal plan (DB stub)."""

    raise NotImplementedError


async def get_meal_plan(
    pool: "asyncpg.Pool",
    plan_id: str,
    user_id: str,
) -> Optional[Dict[str, Any]]:
    """Fetch a single meal plan (DB stub)."""

    raise NotImplementedError


async def list_meal_plans(
    pool: "asyncpg.Pool",
    user_id: str,
    cursor: Optional[str],
    limit: int,
) -> List[Dict[str, Any]]:
    """List meal plans with cursor pagination (DB stub)."""

    raise NotImplementedError


async def update_meal_plan(
    pool: "asyncpg.Pool",
    plan_id: str,
    user_id: str,
    updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Patch update (DB stub)."""

    raise NotImplementedError


async def archive_meal_plan(
    pool: "asyncpg.Pool",
    plan_id: str,
    user_id: str,
) -> bool:
    """Archive the plan (DB stub)."""

    raise NotImplementedError

