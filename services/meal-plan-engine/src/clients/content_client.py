"""HTTP client for content-service (celebrities, base-diets, recipes).

All URLs are resolved from ``settings.CONTENT_SERVICE_URL``.  The client
is intentionally thin — it fetches JSON and returns plain dicts so the
engine layer stays decoupled from Pydantic serialisation.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

import httpx

from src.config import settings

__all__ = ["get_base_diet", "get_recipes_for_diet"]

_logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


async def get_base_diet(base_diet_id: str) -> Dict[str, Any]:
    """Fetch a single base-diet by ID from content-service."""

    url = f"{settings.CONTENT_SERVICE_URL}/base-diets/{base_diet_id}"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data: Dict[str, Any] = resp.json()
        return data


async def get_recipes_for_diet(base_diet_id: str) -> List[Dict[str, Any]]:
    """Fetch all recipes belonging to a base-diet (paginated internally)."""

    url = f"{settings.CONTENT_SERVICE_URL}/base-diets/{base_diet_id}/recipes"
    items: List[Dict[str, Any]] = []
    cursor: str | None = None

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        while True:
            params: Dict[str, str] = {"limit": "100"}
            if cursor is not None:
                params["cursor"] = cursor

            resp = await client.get(url, params=params)
            resp.raise_for_status()
            body = resp.json()

            items.extend(body.get("items", []))

            if not body.get("has_next", False):
                break
            cursor = body.get("next_cursor")
            if cursor is None:
                break

    _logger.info("Fetched %d recipes for base_diet %s", len(items), base_diet_id)
    return items
