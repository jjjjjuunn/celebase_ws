"""Pydantic models representing the Meal-Plan domain.

Only the subset needed for phase 004-a (status *queued*) has been included.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# Enumerations -----------------------------------------------------------------

VALID_STATUSES = {
    "queued",
    "generating",
    "draft",
    "active",
    "completed",
    "failed",
    "expired",
    "archived",
}

VALID_MEAL_TYPES = {"breakfast", "lunch", "dinner", "snack"}
VALID_BUDGET_LEVELS = {"low", "moderate", "high"}


# Request / response schemas ----------------------------------------------------


class GenerateMealPlanRequest(BaseModel):
    """Client payload for *generate new meal-plan* request."""

    base_diet_id: UUID
    duration_days: int = Field(ge=1, le=30, default=7)
    preferences: dict[str, Any] = Field(default_factory=dict)

    # Validation helpers -------------------------------------------------------

    @field_validator("preferences", mode="before")
    @classmethod
    def _ensure_preferences_dict(cls, v: Any) -> dict[str, Any]:  # noqa: D401
        return v or {}


class GenerateMealPlanResponse(BaseModel):
    id: UUID
    status: str  # always "queued" for v004-a
    estimated_completion_sec: int  # e.g. 15
    poll_url: str
    ws_channel: str


class MealPlanRow(BaseModel):
    """Projection that matches the *meal_plans* table columns."""

    id: UUID
    user_id: UUID
    base_diet_id: UUID
    name: str | None
    status: str
    adjustments: dict[str, Any]
    preferences: dict[str, Any] = Field(default_factory=dict)
    start_date: date
    end_date: date
    daily_plans: list[Any]
    created_at: datetime
    updated_at: datetime


class PatchMealPlanRequest(BaseModel):
    name: str | None = None
    daily_plans: list[Any] | None = None
    adjustments: dict[str, Any] | None = None
