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
# Tier credit limits (IMPL-MEAL-CREDIT-001 — credit = 1 day)
# ---------------------------------------------------------------------------
#
# A meal plan of N days consumes N credits. The limit is interpreted per-window:
#   - free:    one-time LIFETIME grant of 3 credits (granted at onboarding;
#              never resets). Replaces the legacy time-boxed 3-day trial.
#   - premium: 15 credits per calendar month (UTC).
#   - elite:   30 credits per calendar month (UTC) — capped (≈ a full month of
#              1-day plans) to bound LLM token cost; was previously unlimited.
# Unlimited is still reachable per-user via an admin quota_override of null.

TIER_LIMITS: dict[str, int | None] = {
    "free": 3,
    "premium": 15,
    "elite": 30,
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
    """Return the effective credit limit for the tier's window.

    - ``None`` means unlimited.
    - ``0`` means feature disabled (only via an explicit admin override).
    - Positive int is the credit cap (days) for the tier's window
      (lifetime for free, calendar month for premium/elite).

    ``quota_override.max_plans_per_month`` takes precedence when present
    (admin-set): explicitly ``None`` (JSON null) → unlimited regardless of tier.
    NOTE: under the credit model this override caps DAYS (credits), not the
    number of plans; the field name is retained to avoid a schema migration.
    """
    # Explicit admin override wins.
    if (
        quota_override is not None
        and "max_plans_per_month" in quota_override.model_fields_set
    ):
        return quota_override.max_plans_per_month  # could be None (unlimited) or an int

    return TIER_LIMITS.get(tier, 0)


def is_lifetime_window(tier: str) -> bool:
    """Free tier's credit grant is lifetime; paid tiers reset each calendar month."""
    return tier == "free"


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
    tier: str,
    effective_limit: int | None,
    base_diet_id: str,
    duration_days: int,
    preferences: dict[str, Any],
    idempotency_key: str,
) -> tuple[bool, int, Optional[dict[str, Any]]]:
    """Atomically check the credit balance and insert a new plan if it fits.

    A plan of ``duration_days`` consumes ``duration_days`` credits. The already
    consumed total is summed over the tier's window (lifetime for free, the
    current calendar month for paid tiers) and the request is allowed only when
    ``consumed + duration_days <= effective_limit``.

    Uses ``pg_advisory_xact_lock`` to serialise concurrent requests for the same
    user so the read-sum-then-insert is race-free (Codex F1 + AR-01).

    Returns ``(allowed, consumed_credits, new_row_or_none)``.
    """
    if effective_limit is None:
        # Unlimited — skip advisory lock, insert directly.
        row = await repo.create_meal_plan(
            pool,
            user_id,
            base_diet_id,
            duration_days,
            preferences,
            idempotency_key,
        )
        return (True, 0, row)

    if effective_limit == 0:
        return (False, 0, None)

    lifetime = is_lifetime_window(tier)

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT pg_advisory_xact_lock($1)",
                _advisory_lock_key(user_id),
            )
            if lifetime:
                consumed = await repo.sum_credits_lifetime(conn, user_id)
            else:
                consumed = await repo.sum_credits_this_month(conn, user_id)
            if consumed + duration_days > effective_limit:
                return (False, consumed, None)
            row = await repo.create_meal_plan(
                conn,
                user_id,
                base_diet_id,
                duration_days,
                preferences,
                idempotency_key,
            )
            return (True, consumed, row)
