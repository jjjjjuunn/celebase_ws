"""API routes for /meal-plans/*.

This module purposefully implements the HTTP contract for IMPL-004-a. Business
logic is delegated to the repository layer which will be mocked during unit
tests.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
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


_jwks_client: pyjwt.PyJWKClient | None = None


def _get_jwks_client() -> pyjwt.PyJWKClient:
    """Lazily build (and cache) the user-service JWKS client."""
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = pyjwt.PyJWKClient(settings.INTERNAL_JWKS_URI)
    return _jwks_client


def _verify_jwt_payload(token: str) -> Dict[str, Any]:
    """Verify an internal JWT and return its payload (CHORE-AUTH-ASYMMETRIC-SIGNING-001 Phase 2a).

    Dual-verify: RS256 tokens are checked against user-service's JWKS
    (settings.INTERNAL_JWKS_URI), HS256 tokens against the shared secret. The
    header alg picks the path; each alg routes to a different key, so RS256/HS256
    algorithm confusion is impossible. Issuer bound to INTERNAL_JWT_ISSUER and
    token_use must be 'access' — identical to the TS service-core verifier.
    """
    alg = pyjwt.get_unverified_header(token).get("alg")
    require = ["sub", "exp", "token_use", "iss"]

    if alg == "RS256":
        if not settings.INTERNAL_JWKS_URI:
            raise ValueError("RS256 token but INTERNAL_JWKS_URI not configured")
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        payload = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.INTERNAL_JWT_ISSUER,
            options={"require": require},
        )
    else:
        payload = pyjwt.decode(
            token,
            settings.INTERNAL_JWT_SECRET,
            algorithms=["HS256"],
            issuer=settings.INTERNAL_JWT_ISSUER,
            options={"require": require},
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
    except (pyjwt.InvalidTokenError, pyjwt.PyJWKClientError, ValueError) as exc:
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
    except (pyjwt.InvalidTokenError, pyjwt.PyJWKClientError, ValueError) as exc:
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

    # Step 3: Validate subscription & compute the tier's credit limit.
    sub = quota_service.validate_subscription(raw_sub)
    effective_limit = quota_service.compute_effective_limit(
        sub.tier, sub.quota_override
    )

    # Step 4: Feature disabled (admin override of 0) → 403. Under the credit
    # model the free tier carries a positive grant, so a normal free user no
    # longer hits this path; exhausting credits returns 429 below.
    if effective_limit == 0:
        return _error_response(
            "SUBSCRIPTION_REQUIRED",
            "Meal plan generation is not available on this account",
            request_id,
            403,
        )

    # Step 5: Atomic credit check + insert (a plan consumes duration_days credits).
    allowed, consumed, row = await quota_service.check_quota_atomic(
        pool,
        auth.user_id,
        sub.tier,
        effective_limit,
        str(body.base_diet_id),
        body.duration_days,
        body.preferences,
        idem_key,
    )

    if not allowed:
        lifetime = quota_service.is_lifetime_window(sub.tier)
        window = "lifetime free" if lifetime else "monthly"
        headers: Dict[str, str] = {}
        if not lifetime:
            # Free credits are a one-time lifetime grant — they do not reset, so
            # only paid tiers get a Retry-After pointing at the monthly rollover.
            headers["Retry-After"] = str(
                quota_service.seconds_until_next_month(datetime.now(timezone.utc))
            )
        return JSONResponse(
            status_code=429,
            content={
                "error": {
                    "code": "PLAN_LIMIT_REACHED",
                    "message": (
                        f"Credit limit reached: {consumed}/{effective_limit} "
                        f"{window} credits used — a {body.duration_days}-day plan "
                        f"needs {body.duration_days}"
                    ),
                    "requestId": request_id,
                }
            },
            headers=headers,
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
    # Cursor is the last row's created_at (list is ordered created_at DESC).
    next_cursor = items[-1]["created_at"].isoformat() if has_next else None

    return {"items": items, "has_next": has_next, "next_cursor": next_cursor}


# GET /meal-plans/credits -----------------------------------------------------
# IMPORTANT: registered before GET /{plan_id} so the literal "credits" path is
# matched first (otherwise FastAPI routes it into the {plan_id} param).


@router.get("/credits", status_code=status.HTTP_200_OK)
async def get_meal_plan_credits(
    request: Request,
    auth: AuthInfo = Depends(get_auth_info),
):
    """Return the user's credit balance for their tier's window.

    free → lifetime grant (credits_reset_at null); premium/elite → monthly
    (credits_reset_at = next month 00:00 UTC). Unlimited admin overrides report
    null total/remaining. IMPL-MEAL-CREDIT-001.
    """
    request_id = await get_request_id(request)
    pool = await get_pool()

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

    sub = quota_service.validate_subscription(raw_sub)
    effective_limit = quota_service.compute_effective_limit(
        sub.tier, sub.quota_override
    )
    lifetime = quota_service.is_lifetime_window(sub.tier)

    if lifetime:
        consumed = await repo.sum_credits_lifetime(pool, auth.user_id)
    else:
        consumed = await repo.sum_credits_this_month(pool, auth.user_id)

    if effective_limit is None:
        # Unlimited (admin override) — no finite balance to report.
        credits_total: Optional[int] = None
        credits_remaining: Optional[int] = None
    else:
        credits_total = effective_limit
        credits_remaining = max(0, effective_limit - consumed)

    now_utc = datetime.now(timezone.utc)
    credits_reset_at = (
        None
        if lifetime
        else (
            now_utc + timedelta(seconds=quota_service.seconds_until_next_month(now_utc))
        ).isoformat()
    )

    return {
        "tier": sub.tier,
        "credits_remaining": credits_remaining,
        "credits_total": credits_total,
        "credits_reset_at": credits_reset_at,
    }


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
