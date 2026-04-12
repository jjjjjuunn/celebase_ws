"""HTTP client for user-service (bio-profile retrieval).

Returns the raw bio-profile dict.  Callers are expected to run
``phi_minimizer.minimize_profile()`` before passing data to engine modules.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

import httpx

from src.config import settings

__all__ = ["get_bio_profile"]

_logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


async def get_bio_profile(user_id: str, auth_token: str) -> Dict[str, Any]:
    """Fetch the bio-profile for *user_id* from user-service.

    Parameters
    ----------
    user_id:
        The user whose profile is being requested.
    auth_token:
        A Bearer token forwarded from the original request so user-service
        can verify identity.
    """

    url = f"{settings.USER_SERVICE_URL}/users/me/bio-profile"
    headers = {"Authorization": f"Bearer {auth_token}"}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data: Dict[str, Any] = resp.json()
        _logger.info("Fetched bio-profile for user %s", user_id)
        return data
