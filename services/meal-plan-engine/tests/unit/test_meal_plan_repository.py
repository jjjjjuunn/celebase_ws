"""Unit tests for meal_plan_repository.create_meal_plan date assignment.

Covers consecutive-date scheduling (FEAT-MEAL-CONSECUTIVE-DATES-001): a new plan
begins the day after the user's latest non-deleted, non-failed plan ends, clamped
to today so a stale past plan never backdates the new one. The DB layer is mocked
(AsyncMock) — these tests exercise the date computation, not the SQL execution.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from unittest.mock import AsyncMock

from src.repositories import meal_plan_repository as repo


def _today():
    return datetime.now(timezone.utc).date()


async def _create_with_latest_end(latest_end, duration: int = 3):
    """Run create_meal_plan with a mocked conn whose MAX(end_date) = latest_end.

    Returns the (start_date, end_date) the INSERT was called with.
    """
    conn = AsyncMock()
    conn.fetchval = AsyncMock(return_value=latest_end)
    conn.fetchrow = AsyncMock(
        return_value={"id": "01927000-0000-7000-8000-0000000000ff"}
    )
    await repo.create_meal_plan(conn, "user-1", "base-diet-1", duration, {}, "")
    # fetchrow positional args: (query, user_id, base_diet_id, prefs, start_date, end_date, idem, duration)
    args = conn.fetchrow.call_args.args
    return args[4], args[5]


class TestCreateMealPlanDates:
    @pytest.mark.asyncio
    async def test_no_existing_plans_starts_today(self) -> None:
        start, end = await _create_with_latest_end(None, duration=3)
        today = _today()
        assert start == today
        assert end == today + timedelta(days=2)

    @pytest.mark.asyncio
    async def test_latest_end_in_future_appends_consecutively(self) -> None:
        future_end = _today() + timedelta(days=10)
        start, end = await _create_with_latest_end(future_end, duration=3)
        assert start == future_end + timedelta(days=1)
        assert end == future_end + timedelta(days=3)

    @pytest.mark.asyncio
    async def test_latest_end_in_past_clamps_to_today(self) -> None:
        past_end = _today() - timedelta(days=10)
        start, end = await _create_with_latest_end(past_end, duration=2)
        today = _today()
        assert start == today
        assert end == today + timedelta(days=1)

    @pytest.mark.asyncio
    async def test_date_query_excludes_failed_and_deleted(self) -> None:
        # failed-only / deleted-only history → MAX(end_date) is NULL → starts today.
        # The exclusion is enforced by the SQL filter; assert both clauses are present.
        conn = AsyncMock()
        conn.fetchval = AsyncMock(return_value=None)
        conn.fetchrow = AsyncMock(return_value={"id": "x"})
        await repo.create_meal_plan(conn, "user-1", "base-diet-1", 3, {}, "")
        sql = conn.fetchval.call_args.args[0]
        assert "deleted_at IS NULL" in sql
        assert "status <> 'failed'" in sql


class TestListMealPlansOrdering:
    """list_meal_plans is newest-first by created_at (FIX-MEAL-PLAN-DATES-001).

    meal_plans ids are random UUIDv4, so the prior ``ORDER BY id ASC`` returned an
    arbitrary page that buried recent completed plans under older failed ones.
    """

    @pytest.mark.asyncio
    async def test_no_cursor_orders_by_created_at_desc(self) -> None:
        pool = AsyncMock()
        pool.fetch = AsyncMock(return_value=[])
        await repo.list_meal_plans(pool, "user-1", None, 20)
        sql = pool.fetch.call_args.args[0]
        assert "ORDER BY created_at DESC" in sql
        assert "id ASC" not in sql
        assert "deleted_at IS NULL" in sql

    @pytest.mark.asyncio
    async def test_cursor_filters_on_created_at(self) -> None:
        pool = AsyncMock()
        pool.fetch = AsyncMock(return_value=[])
        cursor = "2026-05-22T00:00:00+00:00"
        await repo.list_meal_plans(pool, "user-1", cursor, 20)
        sql = pool.fetch.call_args.args[0]
        assert "created_at < $2::timestamptz" in sql
        assert "ORDER BY created_at DESC" in sql
        assert pool.fetch.call_args.args[2] == cursor
