"""Unit tests for meal-plan-engine FastAPI routes.

The repository layer is patched with :pyclass:`unittest.mock.AsyncMock` so the
tests remain hermetic and do not require a running PostgreSQL instance.
"""

from __future__ import annotations

import time
from uuid import uuid4

import jwt as pyjwt
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

from main import app
from src.config import settings


# Patch DB init/close to no-ops so the service can start without PostgreSQL.


def _make_mock_pool() -> MagicMock:
    """Create a mock pool whose ``acquire()`` yields an AsyncMock connection."""
    mock_conn = AsyncMock()

    @asynccontextmanager
    async def _transaction():
        yield

    mock_conn.transaction = _transaction

    pool = MagicMock()

    @asynccontextmanager
    async def _acquire():
        yield mock_conn

    pool.acquire = _acquire
    # Also support direct calls (non-transaction path)
    pool.fetchrow = AsyncMock()
    pool.fetch = AsyncMock()
    pool.fetchval = AsyncMock()
    pool.execute = AsyncMock()
    return pool


@pytest_asyncio.fixture(name="client")
async def _client_fixture():  # noqa: D401
    """Provide an *httpx* AsyncClient bound to the FastAPI *app*."""

    with patch("src.database.init_pool", new_callable=AsyncMock), patch(
        "src.database.close_pool", new_callable=AsyncMock
    ), patch("src.routes.meal_plans.get_pool", new_callable=AsyncMock) as mock_get_pool:
        mock_get_pool.return_value = _make_mock_pool()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:  # type: ignore[arg-type]
            yield client


def _auth_header() -> dict[str, str]:
    """Return a properly signed Authorization header with access token claims."""

    token = pyjwt.encode(
        {"sub": "u1", "exp": int(time.time()) + 3600, "token_use": "access"},
        settings.JWT_SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Helper patch decorator ------------------------------------------------------
# ---------------------------------------------------------------------------


def repo_patch(path: str):  # noqa: D401
    """A decorator that patches *src.repositories.meal_plan_repository.<path>*."""

    return patch(f"src.repositories.meal_plan_repository.{path}", new_callable=AsyncMock)


def _sub_patch(path: str):
    """Patch in src.clients.user_client or src.services.quota_service."""
    return patch(path, new_callable=AsyncMock)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@repo_patch("create_meal_plan")
@repo_patch("count_plans_this_month")
@_sub_patch("src.clients.user_client.get_subscription")
@repo_patch("find_recent_duplicate")
async def test_generate_success(mock_dedup, mock_sub, mock_count, mock_create, client):  # type: ignore[missing-type-doc]
    """POST /meal-plans/generate returns 201 with queued status."""

    plan_id = str(uuid4())
    mock_dedup.return_value = None
    mock_sub.return_value = {"tier": "premium", "status": "active", "quota_override": {}}
    mock_count.return_value = 0
    mock_create.return_value = {"id": plan_id}

    resp = await client.post(
        "/meal-plans/generate",
        json={"base_diet_id": str(uuid4()), "duration_days": 7, "preferences": {}},
        headers=_auth_header(),
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "queued"
    assert body["id"] == plan_id


@pytest.mark.asyncio
async def test_generate_unauthorized(client):  # type: ignore[missing-type-doc]
    resp = await client.post("/meal-plans/generate", json={})
    assert resp.status_code == 401


@pytest.mark.asyncio
@repo_patch("list_meal_plans")
async def test_list_meal_plans(mock_list, client):  # type: ignore[missing-type-doc]
    mock_list.return_value = [{"id": str(uuid4()), "status": "queued"}]
    resp = await client.get("/meal-plans", headers=_auth_header())
    assert resp.status_code == 200
    assert resp.json()["items"]


@pytest.mark.asyncio
@repo_patch("get_meal_plan")
async def test_get_meal_plan(mock_get, client):  # type: ignore[missing-type-doc]
    pid = str(uuid4())
    mock_get.return_value = {"id": pid, "status": "queued"}
    resp = await client.get(f"/meal-plans/{pid}", headers=_auth_header())
    assert resp.status_code == 200
    assert resp.json()["id"] == pid


@pytest.mark.asyncio
@repo_patch("get_meal_plan")
async def test_get_meal_plan_not_found(mock_get, client):  # type: ignore[missing-type-doc]
    mock_get.return_value = None
    resp = await client.get(f"/meal-plans/{uuid4()}", headers=_auth_header())
    assert resp.status_code == 404


@pytest.mark.asyncio
@repo_patch("get_meal_plan")
@repo_patch("update_meal_plan")
async def test_patch_meal_plan(mock_update, mock_get, client):  # type: ignore[missing-type-doc]
    pid = str(uuid4())
    mock_get.return_value = {"id": pid, "status": "draft", "name": None}
    mock_update.return_value = {"id": pid, "status": "draft", "name": "Custom"}

    resp = await client.patch(
        f"/meal-plans/{pid}",
        json={"name": "Custom"},
        headers=_auth_header(),
    )

    assert resp.status_code == 200
    assert resp.json()["name"] == "Custom"


@pytest.mark.asyncio
@repo_patch("archive_meal_plan")
async def test_delete_meal_plan(mock_archive, client):  # type: ignore[missing-type-doc]
    mock_archive.return_value = True
    pid = str(uuid4())
    resp = await client.delete(f"/meal-plans/{pid}", headers=_auth_header())
    assert resp.status_code == 204


@pytest.mark.asyncio
@repo_patch("get_meal_plan")
async def test_regenerate_invalid_state(mock_get, client):  # type: ignore[missing-type-doc]
    pid = str(uuid4())
    mock_get.return_value = {"id": pid, "status": "completed"}
    resp = await client.post(f"/meal-plans/{pid}/regenerate", headers=_auth_header())
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# JWT negative path tests (C1 verification)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_signature_returns_401(client):
    """A token signed with the wrong key should be rejected."""
    token = pyjwt.encode(
        {"sub": "u1", "exp": int(time.time()) + 3600, "token_use": "access"},
        "wrong-secret",
        algorithm="HS256",
    )
    resp = await client.get("/meal-plans", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_returns_401(client):
    """An expired token should be rejected."""
    token = pyjwt.encode(
        {"sub": "u1", "exp": int(time.time()) - 60, "token_use": "access"},
        settings.JWT_SECRET,
        algorithm="HS256",
    )
    resp = await client.get("/meal-plans", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_rejected_on_api(client):
    """A refresh token (token_use=refresh) should not work on protected routes."""
    token = pyjwt.encode(
        {"sub": "u1", "exp": int(time.time()) + 3600, "token_use": "refresh"},
        settings.JWT_SECRET,
        algorithm="HS256",
    )
    resp = await client.get("/meal-plans", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_missing_token_use_returns_401(client):
    """A token without token_use claim should be rejected."""
    token = pyjwt.encode(
        {"sub": "u1", "exp": int(time.time()) + 3600},
        settings.JWT_SECRET,
        algorithm="HS256",
    )
    resp = await client.get("/meal-plans", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Health & error handler tests (H4, H5)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check(client):
    """GET /health returns status ok."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "version" in body


# ---------------------------------------------------------------------------
# Quota enforcement tests (IMPL-013)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@_sub_patch("src.clients.user_client.get_subscription")
@repo_patch("find_recent_duplicate")
async def test_generate_free_tier_403(mock_dedup, mock_sub, client):
    """Free tier (limit=0) returns 403 SUBSCRIPTION_REQUIRED."""
    mock_dedup.return_value = None
    mock_sub.return_value = {"tier": "free", "status": None, "quota_override": {}}

    resp = await client.post(
        "/meal-plans/generate",
        json={"base_diet_id": str(uuid4()), "duration_days": 7, "preferences": {}},
        headers=_auth_header(),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "SUBSCRIPTION_REQUIRED"


@pytest.mark.asyncio
@repo_patch("create_meal_plan")
@repo_patch("count_plans_this_month")
@_sub_patch("src.clients.user_client.get_subscription")
@repo_patch("find_recent_duplicate")
async def test_generate_premium_under_limit_201(mock_dedup, mock_sub, mock_count, mock_create, client):
    """Premium user under limit gets 201."""
    mock_dedup.return_value = None
    mock_sub.return_value = {"tier": "premium", "status": "active", "quota_override": {}}
    mock_count.return_value = 3
    plan_id = str(uuid4())
    mock_create.return_value = {"id": plan_id}

    resp = await client.post(
        "/meal-plans/generate",
        json={"base_diet_id": str(uuid4()), "duration_days": 7, "preferences": {}},
        headers=_auth_header(),
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "queued"


@pytest.mark.asyncio
@repo_patch("count_plans_this_month")
@_sub_patch("src.clients.user_client.get_subscription")
@repo_patch("find_recent_duplicate")
async def test_generate_premium_at_limit_429(mock_dedup, mock_sub, mock_count, client):
    """Premium at 4/4 gets 429 PLAN_LIMIT_REACHED with Retry-After."""
    mock_dedup.return_value = None
    mock_sub.return_value = {"tier": "premium", "status": "active", "quota_override": {}}
    mock_count.return_value = 4

    resp = await client.post(
        "/meal-plans/generate",
        json={"base_diet_id": str(uuid4()), "duration_days": 7, "preferences": {}},
        headers=_auth_header(),
    )
    assert resp.status_code == 429
    assert resp.json()["error"]["code"] == "PLAN_LIMIT_REACHED"
    assert "retry-after" in resp.headers


@pytest.mark.asyncio
@repo_patch("create_meal_plan")
@_sub_patch("src.clients.user_client.get_subscription")
@repo_patch("find_recent_duplicate")
async def test_generate_elite_201_no_count(mock_dedup, mock_sub, mock_create, client):
    """Elite tier gets 201 without count query."""
    mock_dedup.return_value = None
    mock_sub.return_value = {"tier": "elite", "status": "active", "quota_override": {}}
    plan_id = str(uuid4())
    mock_create.return_value = {"id": plan_id}

    resp = await client.post(
        "/meal-plans/generate",
        json={"base_diet_id": str(uuid4()), "duration_days": 7, "preferences": {}},
        headers=_auth_header(),
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
@repo_patch("find_recent_duplicate")
async def test_generate_idempotent_existing(mock_dedup, client):
    """Duplicate within 5 min returns existing plan without subscription call."""
    plan_id = str(uuid4())
    mock_dedup.return_value = {"id": plan_id, "status": "queued"}

    resp = await client.post(
        "/meal-plans/generate",
        json={"base_diet_id": str(uuid4()), "duration_days": 7, "preferences": {}},
        headers=_auth_header(),
    )
    assert resp.status_code == 201
    assert resp.json()["id"] == plan_id


@pytest.mark.asyncio
@_sub_patch("src.clients.user_client.get_subscription")
@repo_patch("find_recent_duplicate")
async def test_generate_user_svc_down_503(mock_dedup, mock_sub, client):
    """user-service failure returns 503 SERVICE_UNAVAILABLE."""
    mock_dedup.return_value = None
    mock_sub.return_value = None  # signals failure

    resp = await client.post(
        "/meal-plans/generate",
        json={"base_diet_id": str(uuid4()), "duration_days": 7, "preferences": {}},
        headers=_auth_header(),
    )
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert "retry-after" in resp.headers


@pytest.mark.asyncio
@repo_patch("create_meal_plan")
@_sub_patch("src.clients.user_client.get_subscription")
@repo_patch("find_recent_duplicate")
async def test_generate_quota_override_null(mock_dedup, mock_sub, mock_create, client):
    """Premium with override=null gets unlimited (201)."""
    mock_dedup.return_value = None
    mock_sub.return_value = {
        "tier": "premium", "status": "active",
        "quota_override": {"max_plans_per_month": None},
    }
    mock_create.return_value = {"id": str(uuid4())}

    resp = await client.post(
        "/meal-plans/generate",
        json={"base_diet_id": str(uuid4()), "duration_days": 7, "preferences": {}},
        headers=_auth_header(),
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
@repo_patch("count_plans_this_month")
@_sub_patch("src.clients.user_client.get_subscription")
@repo_patch("find_recent_duplicate")
async def test_retry_after_positive_int(mock_dedup, mock_sub, mock_count, client):
    """429 response has a positive integer Retry-After header."""
    mock_dedup.return_value = None
    mock_sub.return_value = {"tier": "premium", "status": "active", "quota_override": {}}
    mock_count.return_value = 4

    resp = await client.post(
        "/meal-plans/generate",
        json={"base_diet_id": str(uuid4()), "duration_days": 7, "preferences": {}},
        headers=_auth_header(),
    )
    assert resp.status_code == 429
    retry_after = int(resp.headers["retry-after"])
    assert retry_after > 0
