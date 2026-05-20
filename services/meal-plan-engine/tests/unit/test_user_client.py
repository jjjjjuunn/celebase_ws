"""Unit tests for user_client.get_bio_profile response unwrapping.

user-service wraps the bio-profile as {"bio_profile": {...}} (shared-types
BioProfileResponseSchema + the /users/me {"user": ...} convention). The client
must unwrap it, with a flat fallback so a cross-service deploy window still
works. Regression for FIX-BIOPROFILE-WRAP-CONTRACT-001.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.clients import user_client


def _mock_client(json_payload: dict) -> MagicMock:
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value=json_payload)
    client = MagicMock()
    client.get = AsyncMock(return_value=resp)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    return client


@pytest.mark.asyncio
async def test_get_bio_profile_unwraps_wrapped_response() -> None:
    client = _mock_client(
        {"bio_profile": {"sex": "female", "weight_kg": "60.5", "goal_pace": "moderate"}}
    )
    with patch.object(user_client.httpx, "AsyncClient", return_value=client):
        data = await user_client.get_bio_profile("user-1", "token")

    assert data["sex"] == "female"
    assert data["goal_pace"] == "moderate"
    assert data["weight_kg"] == 60.5  # NUMERIC str coerced to float
    assert "bio_profile" not in data  # fully unwrapped


@pytest.mark.asyncio
async def test_get_bio_profile_flat_fallback() -> None:
    # Flat payload (no bio_profile key) — deploy-window tolerance.
    client = _mock_client({"sex": "male", "weight_kg": "70"})
    with patch.object(user_client.httpx, "AsyncClient", return_value=client):
        data = await user_client.get_bio_profile("user-1", "token")

    assert data["sex"] == "male"
    assert data["weight_kg"] == 70.0
