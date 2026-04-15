"""Subscription quota enforcement logic for meal plan generation.

Spec: §4.3 Subscription Quota Rules + §8 Tier Limits.
"""
from __future__ import annotations

import calendar
import hashlib
import json
import logging
import struct
from datetime import datetime, timedelta
from typing import Any, Optional

import asyncpg
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.repositories import meal_plan_repository as repo

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tier limits (spec §8)
# ---------------------------------------------------------------------------

TIER_LIMITS: dict[str, int | None] = {
    "free": 0,        # feature disabled
    "premium": 4,
    "elite": None,    # unlimited
}

# ---------------------------------------------------------------------------
# Pydantic models for user-service response validation (Codex F9)
# ---------------------------------------------------------------------------


class QuotaOverrideModel(BaseModel):
    max_plans_per_month: int | None = Field(default=None, ge=0)
    model_config = ConfigDict(extra="ignore")


class SubscriptionResponse(BaseModel):
    tier: str = "free"
    status: str | None = None
    quota_override: QuotaOverrideModel | None = QuotaOverrideModel()
    model_config = ConfigDict(extra="ignore")


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------


def validate_subscription(raw: dict[str, Any]) -> SubscriptionResponse:
    """Parse and validate user-service subscription response.

    On validation failure, falls back to free tier with a warning.
    """
    try:
        return SubscriptionResponse.model_validate(raw)
    except ValidationError as exc:
        _logger.warning("Invalid subscription response, defaulting to free: %s", exc)
        return SubscriptionResponse()


def compute_effective_limit(
    tier: str,
    quota_override: QuotaOverrideModel | None,
) -> int | None:
    """Return the effective monthly plan limit.

    - ``None`` means unlimited.
    - ``0`` means feature disabled (Free tier).
    - Positive int is the cap.

    ``quota_override.max_plans_per_month`` takes precedence when present:
    explicitly ``None`` (JSON null) → unlimited regardless of tier.
    """
    if quota_override is None:
        return TIER_LIMITS.get(tier, 0)
    override = quota_override.max_plans_per_month
    # The field is Optional[int] with default None.  We need to distinguish
    # "key absent / not set" (use tier default) from "explicitly None" (unlimited).
    # Pydantic sets the field to None for both cases, but the raw JSON
    # distinguishes them.  We re-check via model_fields_set.
    if "max_plans_per_month" in quota_override.model_fields_set:
        return override  # could be None (unlimited) or an int
    return TIER_LIMITS.get(tier, 0)


def seconds_until_next_month(now_utc: datetime) -> int:
    """Return seconds from *now_utc* until the 1st of next month 00:00 UTC."""
    days_in_month = calendar.monthrange(now_utc.year, now_utc.month)[1]
    month_start = now_utc.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    next_month_start = month_start + timedelta(days=days_in_month)
    return max(int((next_month_start - now_utc).total_seconds()), 1)


def _normalize_value(v: Any) -> Any:
    """Recursively normalize values for deterministic serialisation."""
    if isinstance(v, float) and v == int(v):
        return int(v)
    if isinstance(v, dict):
        return {k: _normalize_value(val) for k, val in sorted(v.items())}
    if isinstance(v, (list, tuple)):
        return [_normalize_value(item) for item in v]
    return v


def build_idempotency_key(
    user_id: str,
    base_diet_id: str,
    duration_days: int,
    preferences: dict[str, Any],
) -> str:
    """Build a deterministic SHA-256 hex key for 5-minute dedup.

    Uses JSON array serialisation (Codex F2) with recursive value
    normalisation (Codex AR-02).
    """
    normalised_prefs = _normalize_value(preferences)
    payload = json.dumps(
        [user_id, base_diet_id, int(duration_days), normalised_prefs],
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _advisory_lock_key(user_id: str) -> int:
    """Deterministic 64-bit signed int lock key from user_id.

    Uses SHA-256 first 8 bytes — independent of PYTHONHASHSEED (Codex AR-01).
    """
    digest = hashlib.sha256(user_id.encode()).digest()
    return struct.unpack(">q", digest[:8])[0]


async def check_quota_atomic(
    pool: asyncpg.Pool,
    user_id: str,
    effective_limit: int | None,
    base_diet_id: str,
    duration_days: int,
    preferences: dict[str, Any],
    idempotency_key: str,
) -> tuple[bool, int, Optional[dict[str, Any]]]:
    """Atomically check quota and insert a new plan if under limit.

    Uses ``pg_advisory_xact_lock`` to serialise concurrent requests for
    the same user (Codex F1 + AR-01).

    Returns ``(allowed, current_count, new_row_or_none)``.
    """
    if effective_limit is None:
        # Unlimited — skip advisory lock, insert directly
        row = await repo.create_meal_plan(
            pool, user_id, base_diet_id, duration_days, preferences, idempotency_key,
        )
        return (True, 0, row)

    if effective_limit == 0:
        return (False, 0, None)

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT pg_advisory_xact_lock($1)",
                _advisory_lock_key(user_id),
            )
            count = await repo.count_plans_this_month(conn, user_id)
            if count >= effective_limit:
                return (False, count, None)
            row = await repo.create_meal_plan(
                conn, user_id, base_diet_id, duration_days, preferences, idempotency_key,
            )
            return (True, count, row)
