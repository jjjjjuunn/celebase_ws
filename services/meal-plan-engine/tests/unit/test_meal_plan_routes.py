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
from unittest.mock import AsyncMock, patch

from main import app
from src.config import settings


# Patch DB init/close to no-ops so the service can start without PostgreSQL.


@pytest_asyncio.fixture(name="client")
async def _client_fixture():  # noqa: D401
    """Provide an *httpx* AsyncClient bound to the FastAPI *app*."""

    with patch("src.database.init_pool", new_callable=AsyncMock), patch(
        "src.database.close_pool", new_callable=AsyncMock
    ), patch("src.routes.meal_plans.get_pool", new_callable=AsyncMock) as mock_get_pool:
        mock_get_pool.return_value = AsyncMock()
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


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@repo_patch("create_meal_plan")
async def test_generate_success(mock_create, client):  # type: ignore[missing-type-doc]
    """POST /meal-plans/generate returns 201 with queued status."""

    plan_id = str(uuid4())
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
