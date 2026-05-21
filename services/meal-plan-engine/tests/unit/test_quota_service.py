"""Unit tests for quota_service — pure business logic, no DB required."""

from __future__ import annotations

from datetime import datetime, timezone
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.services.quota_service import (
    QuotaOverrideModel,
    SubscriptionResponse,
    build_idempotency_key,
    check_quota_atomic,
    compute_effective_limit,
    is_lifetime_window,
    seconds_until_next_month,
    validate_subscription,
)


# ---------------------------------------------------------------------------
# validate_subscription
# ---------------------------------------------------------------------------


class TestValidateSubscription:
    def test_valid_response(self) -> None:
        raw = {
            "tier": "premium",
            "status": "active",
            "quota_override": {"max_plans_per_month": 10},
        }
        result = validate_subscription(raw)
        assert isinstance(result, SubscriptionResponse)
        assert result.tier == "premium"
        assert result.quota_override.max_plans_per_month == 10

    def test_malformed_override_falls_back(self) -> None:
        raw = {"tier": "premium", "quota_override": {"max_plans_per_month": "abc"}}
        result = validate_subscription(raw)
        assert result.tier == "free"  # falls back to default on validation error

    def test_negative_override_falls_back(self) -> None:
        raw = {"tier": "premium", "quota_override": {"max_plans_per_month": -1}}
        # ge=0 constraint rejects negative → falls back to free tier default
        result = validate_subscription(raw)
        assert result.tier == "free"

    def test_null_quota_override_keeps_tier(self) -> None:
        raw = {"tier": "premium", "status": "active", "quota_override": None}
        result = validate_subscription(raw)
        assert result.tier == "premium"
        assert result.quota_override is None

    def test_unknown_extra_fields_ignored(self) -> None:
        # extra='ignore' → legacy trial fields on the wire are silently dropped.
        result = validate_subscription(
            {"tier": "free", "trial_active": True, "trial_ends_at": "2026-01-01"}
        )
        assert result.tier == "free"
        assert not hasattr(result, "trial_active")


# ---------------------------------------------------------------------------
# compute_effective_limit
# ---------------------------------------------------------------------------


class TestComputeEffectiveLimit:
    def test_free_tier_lifetime_grant_is_3(self) -> None:
        assert compute_effective_limit("free", QuotaOverrideModel()) == 3

    def test_premium_tier_limit_is_15(self) -> None:
        assert compute_effective_limit("premium", QuotaOverrideModel()) == 15

    def test_elite_tier_limit_is_30(self) -> None:
        assert compute_effective_limit("elite", QuotaOverrideModel()) == 30

    def test_unknown_tier_defaults_to_zero(self) -> None:
        assert compute_effective_limit("unknown_tier", QuotaOverrideModel()) == 0

    def test_quota_override_integer_overrides_tier(self) -> None:
        override = QuotaOverrideModel.model_validate({"max_plans_per_month": 10})
        assert compute_effective_limit("premium", override) == 10

    def test_quota_override_null_means_unlimited(self) -> None:
        override = QuotaOverrideModel.model_validate({"max_plans_per_month": None})
        assert compute_effective_limit("premium", override) is None

    def test_quota_override_zero_disables(self) -> None:
        override = QuotaOverrideModel.model_validate({"max_plans_per_month": 0})
        assert compute_effective_limit("elite", override) == 0

    def test_none_override_uses_tier_default(self) -> None:
        assert compute_effective_limit("premium", None) == 15
        assert compute_effective_limit("elite", None) == 30


class TestIsLifetimeWindow:
    def test_free_is_lifetime(self) -> None:
        assert is_lifetime_window("free") is True

    def test_paid_tiers_are_monthly(self) -> None:
        assert is_lifetime_window("premium") is False
        assert is_lifetime_window("elite") is False


# ---------------------------------------------------------------------------
# seconds_until_next_month
# ---------------------------------------------------------------------------


class TestSecondsUntilNextMonth:
    def test_mid_month(self) -> None:
        now = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        result = seconds_until_next_month(now)
        # Jan 15 12:00 → Feb 1 00:00 = 16 days + 12 hours = 1,425,600 seconds
        expected = 16 * 86400 + 12 * 3600
        assert result == expected

    def test_last_day(self) -> None:
        now = datetime(2026, 1, 31, 23, 59, 59, tzinfo=timezone.utc)
        result = seconds_until_next_month(now)
        assert result == 1  # max(1-second gap, 1)

    def test_dec_to_jan(self) -> None:
        now = datetime(2026, 12, 31, 0, 0, 0, tzinfo=timezone.utc)
        result = seconds_until_next_month(now)
        assert result == 86400  # exactly 1 day


# ---------------------------------------------------------------------------
# build_idempotency_key
# ---------------------------------------------------------------------------


class TestBuildIdempotencyKey:
    def test_returns_sha256_hex(self) -> None:
        key = build_idempotency_key("u1", "diet1", 7, {})
        assert len(key) == 64
        assert all(c in "0123456789abcdef" for c in key)

    def test_same_input_same_key(self) -> None:
        k1 = build_idempotency_key("u1", "diet1", 7, {"a": 1})
        k2 = build_idempotency_key("u1", "diet1", 7, {"a": 1})
        assert k1 == k2

    def test_different_input_different_key(self) -> None:
        k1 = build_idempotency_key("u1", "diet1", 7, {"a": 1})
        k2 = build_idempotency_key("u1", "diet2", 7, {"a": 1})
        assert k1 != k2

    def test_json_array_deterministic_key_order(self) -> None:
        k1 = build_idempotency_key("u1", "d1", 7, {"b": 2, "a": 1})
        k2 = build_idempotency_key("u1", "d1", 7, {"a": 1, "b": 2})
        assert k1 == k2

    def test_float_int_normalisation(self) -> None:
        k1 = build_idempotency_key("u1", "d1", 7, {"cal": 2000})
        k2 = build_idempotency_key("u1", "d1", 7, {"cal": 2000.0})
        assert k1 == k2


# ---------------------------------------------------------------------------
# check_quota_atomic
# ---------------------------------------------------------------------------


def _make_mock_conn() -> AsyncMock:
    """Create a mock connection whose ``transaction()`` works as an async CM."""
    conn = AsyncMock()

    @asynccontextmanager
    async def _transaction():
        yield

    conn.transaction = _transaction
    return conn


def _make_pool_with_conn(mock_conn: AsyncMock) -> MagicMock:
    """Build a mock pool whose ``acquire()`` yields *mock_conn* as an async CM."""

    @asynccontextmanager
    async def _acquire():
        yield mock_conn

    pool = MagicMock()
    pool.acquire = _acquire
    return pool


class TestCheckQuotaAtomic:
    @pytest.mark.asyncio
    @patch("src.services.quota_service.repo.create_meal_plan", new_callable=AsyncMock)
    async def test_unlimited_skips_db_sum(self, mock_create: AsyncMock) -> None:
        # effective_limit None (admin override) → insert directly, no sum query.
        mock_create.return_value = {"id": "plan-1"}
        pool = MagicMock()

        allowed, consumed, row = await check_quota_atomic(
            pool, "u1", "elite", None, "d1", 7, {}, "key1"
        )

        assert allowed is True
        assert consumed == 0
        assert row == {"id": "plan-1"}

    @pytest.mark.asyncio
    async def test_disabled_limit_skips_db(self) -> None:
        # effective_limit 0 (disabled override) → reject without touching the DB.
        pool = MagicMock()
        allowed, consumed, row = await check_quota_atomic(
            pool, "u1", "free", 0, "d1", 7, {}, "key1"
        )
        assert allowed is False
        assert consumed == 0
        assert row is None

    @pytest.mark.asyncio
    @patch("src.services.quota_service.repo.create_meal_plan", new_callable=AsyncMock)
    @patch(
        "src.services.quota_service.repo.sum_credits_this_month", new_callable=AsyncMock
    )
    async def test_paid_under_limit(
        self, mock_sum: AsyncMock, mock_create: AsyncMock
    ) -> None:
        # premium: 5 used + 7-day plan = 12 <= 15 → allowed.
        mock_sum.return_value = 5
        mock_create.return_value = {"id": "plan-new"}

        pool = _make_pool_with_conn(_make_mock_conn())
        allowed, consumed, row = await check_quota_atomic(
            pool, "u1", "premium", 15, "d1", 7, {}, "key1"
        )
        assert allowed is True
        assert consumed == 5
        mock_create.assert_awaited_once()

    @pytest.mark.asyncio
    @patch("src.services.quota_service.repo.create_meal_plan", new_callable=AsyncMock)
    @patch(
        "src.services.quota_service.repo.sum_credits_this_month", new_callable=AsyncMock
    )
    async def test_paid_exact_limit_allowed(
        self, mock_sum: AsyncMock, mock_create: AsyncMock
    ) -> None:
        # Hitting the limit exactly is allowed (reject is strictly > limit).
        mock_sum.return_value = 8
        mock_create.return_value = {"id": "plan-new"}

        pool = _make_pool_with_conn(_make_mock_conn())
        allowed, consumed, row = await check_quota_atomic(
            pool, "u1", "premium", 15, "d1", 7, {}, "key1"
        )
        assert allowed is True  # 8 + 7 == 15
        assert consumed == 8
        mock_create.assert_awaited_once()

    @pytest.mark.asyncio
    @patch("src.services.quota_service.repo.create_meal_plan", new_callable=AsyncMock)
    @patch(
        "src.services.quota_service.repo.sum_credits_this_month", new_callable=AsyncMock
    )
    async def test_paid_over_limit_rejected(
        self, mock_sum: AsyncMock, mock_create: AsyncMock
    ) -> None:
        # 10 used + 7-day plan = 17 > 15 → rejected, no insert.
        mock_sum.return_value = 10

        pool = _make_pool_with_conn(_make_mock_conn())
        allowed, consumed, row = await check_quota_atomic(
            pool, "u1", "premium", 15, "d1", 7, {}, "key1"
        )
        assert allowed is False
        assert consumed == 10
        assert row is None
        mock_create.assert_not_awaited()

    @pytest.mark.asyncio
    @patch("src.services.quota_service.repo.create_meal_plan", new_callable=AsyncMock)
    @patch(
        "src.services.quota_service.repo.sum_credits_lifetime", new_callable=AsyncMock
    )
    @patch(
        "src.services.quota_service.repo.sum_credits_this_month", new_callable=AsyncMock
    )
    async def test_free_uses_lifetime_window(
        self,
        mock_month: AsyncMock,
        mock_lifetime: AsyncMock,
        mock_create: AsyncMock,
    ) -> None:
        # free tier sums LIFETIME credits, never the monthly window.
        mock_lifetime.return_value = 1
        mock_create.return_value = {"id": "plan-free"}

        pool = _make_pool_with_conn(_make_mock_conn())
        allowed, consumed, row = await check_quota_atomic(
            pool, "u1", "free", 3, "d1", 1, {}, "key1"
        )
        assert allowed is True  # 1 + 1 <= 3
        assert consumed == 1
        mock_lifetime.assert_awaited_once()
        mock_month.assert_not_awaited()

    @pytest.mark.asyncio
    @patch("src.services.quota_service.repo.create_meal_plan", new_callable=AsyncMock)
    @patch(
        "src.services.quota_service.repo.sum_credits_lifetime", new_callable=AsyncMock
    )
    async def test_free_over_lifetime_rejected(
        self, mock_lifetime: AsyncMock, mock_create: AsyncMock
    ) -> None:
        # free with 3 lifetime credits used → a further 1-day plan is rejected.
        mock_lifetime.return_value = 3

        pool = _make_pool_with_conn(_make_mock_conn())
        allowed, consumed, row = await check_quota_atomic(
            pool, "u1", "free", 3, "d1", 1, {}, "key1"
        )
        assert allowed is False
        assert consumed == 3
        assert row is None
        mock_create.assert_not_awaited()
