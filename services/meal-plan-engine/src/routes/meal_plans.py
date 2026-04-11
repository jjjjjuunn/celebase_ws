"""API routes for /meal-plans/*.

This module purposefully implements the HTTP contract for IMPL-004-a. Business
logic is delegated to the repository layer which will be mocked during unit
tests.
"""

from __future__ import annotations

import base64
import json
import logging
from typing import Any, Dict, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse

from src.database import get_pool
from src.models.meal_plan import (
    GenerateMealPlanRequest,
    GenerateMealPlanResponse,
    PatchMealPlanRequest,
)
from src.repositories import meal_plan_repository as repo

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _error_response(code: str, message: str, request_id: str, status_code: int) -> JSONResponse:
    """Wrap error payload to conform with spec."""

    content = {"error": {"code": code, "message": message, "requestId": request_id}}
    return JSONResponse(status_code=status_code, content=content)


async def get_request_id(request: Request) -> str:  # noqa: D401
    return request.headers.get("x-request-id", str(uuid4()))


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------


def _decode_jwt_payload(token: str) -> Dict[str, Any]:
    """Decode JWT payload without signature verification (dev stub; swap for JWKS in prod)."""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT structure")
    # Restore base64url padding
    padded = parts[1] + "=" * (-len(parts[1]) % 4)
    payload_bytes = base64.urlsafe_b64decode(padded)
    return dict(json.loads(payload_bytes))


async def get_current_user_id(authorization: str | None = Header(None)) -> str:  # noqa: D401
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    token = authorization.removeprefix("Bearer ")
    try:
        payload = _decode_jwt_payload(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="UNAUTHORIZED")
        return str(user_id)
    except Exception as exc:
        logger.debug("JWT decode failed: %s", exc)
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
    user_id: str = Depends(get_current_user_id),
):
    pool = await get_pool()

    # DB persistence (stubbed in repo)
    row = await repo.create_meal_plan(
        pool,
        user_id,
        str(body.base_diet_id),
        body.duration_days,
        body.preferences,
    )

    plan_id = UUID(str(row["id"]))

    resp = GenerateMealPlanResponse(
        id=plan_id,
        status="queued",
        estimated_completion_sec=15,
        poll_url=f"/meal-plans/{plan_id}",
        ws_channel=f"meal_plan_{plan_id}",
    )

    return resp


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
        return _error_response("NOT_FOUND", "Meal plan not found", await get_request_id(request), 404)

    return row


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
        return _error_response("NOT_FOUND", "Meal plan not found", await get_request_id(request), 404)

    if current["status"] != "draft":
        return _error_response("INVALID_STATE", "Only draft plans can be modified", await get_request_id(request), 400)

    updates: Dict[str, Any] = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}

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
        return _error_response("NOT_FOUND", "Meal plan not found", await get_request_id(request), 404)

    if current["status"] != "failed":
        return _error_response("INVALID_STATE", "Only failed plans can be regenerated", await get_request_id(request), 400)

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
        return _error_response("NOT_FOUND", "Meal plan not found", await get_request_id(request), 404)

    return JSONResponse(status_code=204, content=None)
