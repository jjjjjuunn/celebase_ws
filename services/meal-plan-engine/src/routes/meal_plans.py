"""API routes for /meal-plans/*.

This module purposefully implements the HTTP contract for IMPL-004-a. Business
logic is delegated to the repository layer which will be mocked during unit
tests.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, NamedTuple, Optional
from uuid import UUID, uuid4

import jwt as pyjwt
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse

from src.clients import user_client
from src.config import settings
from src.database import get_pool
from src.models.meal_plan import (
    GenerateMealPlanRequest,
    GenerateMealPlanResponse,
    PatchMealPlanRequest,
)
from src.repositories import meal_plan_repository as repo
from src.services import quota_service
from src.services.sqs_publisher import PlanGenerationMessage, enqueue_plan_job

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _error_response(
    code: str, message: str, request_id: str, status_code: int
) -> JSONResponse:
    """Wrap error payload to conform with spec."""

    content = {"error": {"code": code, "message": message, "requestId": request_id}}
    return JSONResponse(status_code=status_code, content=content)


def _serialize_meal_plan_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Reshape raw DB row to GET /meal-plans/{id} contract (IMPL-APP-005).

    - mode: top-level canonical field from adjustments.mode
    - llm_provenance: excluded from response (internal audit JSONB only)
    - narrative/citations: per-meal from daily_plans JSONB; null/[] when mode=standard
    """
    adjustments: Dict[str, Any] = row.get("adjustments") or {}
    mode: str = adjustments.get("mode", "standard")
    is_llm = mode == "llm"

    raw_plans = row.get("daily_plans") or []
    daily_plans = []
    for day in raw_plans:
        meals = []
        for meal in day.get("meals", []):
            meals.append(
                {
                    "meal_type": meal.get("meal_type"),
                    "recipe_id": meal.get("recipe_id"),
                    "narrative": meal.get("narrative") if is_llm else None,
                    "citations": meal.get("citations", []) if is_llm else [],
                }
            )
        day_out: Dict[str, Any] = {
            "day": day.get("day"),
            "date": day.get("date"),
            "meals": meals,
        }
        if "daily_totals" in day:
            day_out["daily_totals"] = day["daily_totals"]
        daily_plans.append(day_out)

    def _fmt(val: Any) -> Optional[str]:
        if val is None:
            return None
        if hasattr(val, "isoformat"):
            return val.isoformat()
        return str(val)

    return {
        "id": str(row["id"]),
        "status": row.get("status"),
        "mode": mode,
        "start_date": _fmt(row.get("start_date")),
        "end_date": _fmt(row.get("end_date")),
        "daily_plans": daily_plans,
        "created_at": _fmt(row.get("created_at")),
        "updated_at": _fmt(row.get("updated_at")),
    }


async def get_request_id(request: Request) -> str:  # noqa: D401
    return request.headers.get("x-request-id", str(uuid4()))


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------


def _verify_jwt_payload(token: str) -> Dict[str, Any]:
    """Verify JWT signature and return payload using PyJWT."""
    payload = pyjwt.decode(
        token,
        settings.INTERNAL_JWT_SECRET,
        algorithms=["HS256"],
        options={"require": ["sub", "exp", "token_use"]},
    )
    if payload.get("token_use") != "access":
        raise ValueError("Invalid token_use: expected 'access'")
    return dict(payload)


async def get_current_user_id(authorization: str | None = Header(None)) -> str:  # noqa: D401
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    token = authorization.removeprefix("Bearer ")
    try:
        payload = _verify_jwt_payload(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="UNAUTHORIZED")
        return str(user_id)
    except (pyjwt.InvalidTokenError, ValueError) as exc:
        logger.debug("JWT verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="UNAUTHORIZED") from exc


class AuthInfo(NamedTuple):
    """User ID + raw Bearer token for inter-service forwarding."""

    user_id: str
    raw_token: str


async def get_auth_info(authorization: str | None = Header(None)) -> AuthInfo:  # noqa: D401
    """Parse Authorization header once, returning both user_id and raw token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    token = authorization.removeprefix("Bearer ")
    try:
        payload = _verify_jwt_payload(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="UNAUTHORIZED")
        return AuthInfo(user_id=str(user_id), raw_token=token)
    except (pyjwt.InvalidTokenError, ValueError) as exc:
        logger.debug("JWT verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="UNAUTHORIZED") from exc


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


router = APIRouter()


# POST /meal-plans/generate ----------------------------------------------------


@router.post(
    "/generate",
    status_code=status.HTTP_201_CREATED,
    response_model=GenerateMealPlanResponse,
)
async def generate_meal_plan(
    request: Request,
    body: GenerateMealPlanRequest,
    auth: AuthInfo = Depends(get_auth_info),
):
    request_id = await get_request_id(request)
    pool = await get_pool()

    # Step 1: Idempotency check (before quota — spec §4.3)
    idem_key = quota_service.build_idempotency_key(
        auth.user_id,
        str(body.base_diet_id),
        body.duration_days,
        body.preferences,
    )
    existing = await repo.find_recent_duplicate(pool, auth.user_id, idem_key)
    if existing:
        return GenerateMealPlanResponse(
            id=UUID(str(existing["id"])),
            status=existing["status"],
            estimated_completion_sec=0,
            poll_url=f"/v1/meal-plans/{existing['id']}",
            ws_channel=f"/ws/meal-plans/{existing['id']}/status",
        )

    # Step 2: Fetch subscription from user-service
    raw_sub = await user_client.get_subscription(auth.raw_token)
    if raw_sub is None:
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": "Unable to verify subscription. Please retry.",
                    "requestId": request_id,
                }
            },
            headers={"Retry-After": "5"},
        )

    # Step 3: Validate & compute limit
    sub = quota_service.validate_subscription(raw_sub)
    effective_limit = quota_service.compute_effective_limit(
        sub.tier, sub.quota_override
    )

    # Step 4: Free tier → 403
    if effective_limit == 0:
        return _error_response(
            "SUBSCRIPTION_REQUIRED",
            "Meal plan generation requires a Premium or Elite subscription",
            request_id,
            403,
        )

    # Step 5: Atomic quota check + insert
    allowed, count, row = await quota_service.check_quota_atomic(
        pool,
        auth.user_id,
        effective_limit,
        str(body.base_diet_id),
        body.duration_days,
        body.preferences,
        idem_key,
    )

    if not allowed:
        retry_after = quota_service.seconds_until_next_month(datetime.now(timezone.utc))
        return JSONResponse(
            status_code=429,
            content={
                "error": {
                    "code": "PLAN_LIMIT_REACHED",
                    "message": f"Monthly limit of {effective_limit} plans reached ({count}/{effective_limit})",
                    "requestId": request_id,
                }
            },
            headers={"Retry-After": str(retry_after)},
        )

    if not row or "id" not in row:
        logger.error("create_meal_plan returned empty row for user %s", auth.user_id)
        return _error_response(
            "INTERNAL_ERROR", "Plan creation failed", request_id, 500
        )

    plan_id = UUID(str(row["id"]))

    # Step 6: Enqueue SQS generation job (IMPL-014-a).
    # Failure must mark the plan failed and surface 503 — no silent drops.
    try:
        await enqueue_plan_job(
            PlanGenerationMessage(
                plan_id=plan_id,
                user_id=UUID(auth.user_id),
                base_diet_id=body.base_diet_id,
                duration_days=body.duration_days,
                auth_token=auth.raw_token,
                preferences=body.preferences,
                idempotency_key=idem_key,
            )
        )
    except Exception:
        logger.exception("SQS enqueue failed, marking plan=%s as failed", plan_id)
        await repo.update_meal_plan(
            pool, str(plan_id), auth.user_id, {"status": "failed"}
        )
        return _error_response(
            "SERVICE_UNAVAILABLE",
            "Queue unavailable. Plan marked failed — please retry.",
            request_id,
            503,
        )

    return GenerateMealPlanResponse(
        id=plan_id,
        status="queued",
        estimated_completion_sec=15,
        poll_url=f"/v1/meal-plans/{plan_id}",
        ws_channel=f"/ws/meal-plans/{plan_id}/status",
    )


# GET /meal-plans -------------------------------------------------------------


@router.get("", status_code=status.HTTP_200_OK)
async def list_meal_plans(
    request: Request,
    cursor: Optional[str] = None,
    limit: int = 20,
    user_id: str = Depends(get_current_user_id),
):
    if limit < 1 or limit > 100:
        limit = 20

    pool = await get_pool()
    rows = await repo.list_meal_plans(pool, user_id, cursor, limit)

    has_next = len(rows) > limit
    items = rows[:limit]
    next_cursor = str(items[-1]["id"]) if has_next else None

    return {"items": items, "has_next": has_next, "next_cursor": next_cursor}


# GET /meal-plans/{plan_id} ----------------------------------------------------


@router.get("/{plan_id}")
async def get_meal_plan(
    request: Request,
    plan_id: str,
    user_id: str = Depends(get_current_user_id),
):
    pool = await get_pool()
    row = await repo.get_meal_plan(pool, plan_id, user_id)
    if row is None:
        return _error_response(
            "NOT_FOUND", "Meal plan not found", await get_request_id(request), 404
        )

    return _serialize_meal_plan_row(row)


# PATCH /meal-plans/{plan_id} --------------------------------------------------


@router.patch("/{plan_id}")
async def patch_meal_plan(
    request: Request,
    plan_id: str,
    body: PatchMealPlanRequest,
    user_id: str = Depends(get_current_user_id),
):
    pool = await get_pool()

    # Ensure current status is draft
    current = await repo.get_meal_plan(pool, plan_id, user_id)
    if current is None:
        return _error_response(
            "NOT_FOUND", "Meal plan not found", await get_request_id(request), 404
        )

    updates: Dict[str, Any] = {
        k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None
    }

    # status transition guards: terminal states block all PATCH; structural edits
    # (daily_plans/adjustments) require draft; status can be set to 'active' from
    # draft or completed (confirm flow), or 'archived' from any non-terminal state.
    current_status = current["status"]
    target_status = updates.get("status")
    structural_edit = bool(set(updates.keys()) & {"daily_plans", "adjustments"})

    if current_status in {"failed", "expired", "archived"}:
        return _error_response(
            "INVALID_STATE",
            f"Cannot modify plan in '{current_status}' state",
            await get_request_id(request),
            400,
        )

    if structural_edit and current_status != "draft":
        return _error_response(
            "INVALID_STATE",
            "daily_plans/adjustments can only be modified on draft plans",
            await get_request_id(request),
            400,
        )

    if target_status == "active" and current_status not in {"draft", "completed"}:
        return _error_response(
            "INVALID_STATE",
            f"Cannot transition from '{current_status}' to 'active'",
            await get_request_id(request),
            400,
        )

    updated = await repo.update_meal_plan(pool, plan_id, user_id, updates)
    return updated


# POST /meal-plans/{plan_id}/regenerate ---------------------------------------


@router.post("/{plan_id}/regenerate")
async def regenerate_meal_plan(
    request: Request,
    plan_id: str,
    user_id: str = Depends(get_current_user_id),
):
    pool = await get_pool()
    current = await repo.get_meal_plan(pool, plan_id, user_id)
    if current is None:
        return _error_response(
            "NOT_FOUND", "Meal plan not found", await get_request_id(request), 404
        )

    if current["status"] != "failed":
        return _error_response(
            "INVALID_STATE",
            "Only failed plans can be regenerated",
            await get_request_id(request),
            400,
        )

    updated = await repo.update_meal_plan(pool, plan_id, user_id, {"status": "queued"})
    return {"id": updated["id"], "status": "queued"}


# DELETE /meal-plans/{plan_id} -------------------------------------------------


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meal_plan(
    request: Request,
    plan_id: str,
    user_id: str = Depends(get_current_user_id),
):
    pool = await get_pool()
    success = await repo.archive_meal_plan(pool, plan_id, user_id)
    if not success:
        return _error_response(
            "NOT_FOUND", "Meal plan not found", await get_request_id(request), 404
        )

    return JSONResponse(status_code=204, content=None)
