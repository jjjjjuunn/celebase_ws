"""WebSocket handler for real-time meal-plan generation status.

Spec §4.2 WebSocket contract:
- Path: ``/ws/meal-plans/{plan_id}/status``
- Auth: 1-time ticket via query param ``ticket=ws_xxx``
- Ticket validated against Redis, immediately deleted after use
- Events: progress, completed, failed
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import redis.asyncio as aioredis

from src.config import settings

__all__ = ["router", "broadcast_progress"]

_logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory registry of active WebSocket connections keyed by plan_id.
# In production with multiple workers, replace with Redis pub/sub.
_connections: Dict[str, list[WebSocket]] = {}


async def _validate_ticket(ticket: str) -> bool:
    """Check ticket in Redis and delete it (single-use, TTL 30s)."""

    redis_url = settings.REDIS_URL
    r = aioredis.from_url(redis_url)
    try:
        key = f"ws:ticket:{ticket}"
        value = await r.get(key)
        if value is None:
            return False
        # Delete immediately — single use
        await r.delete(key)
        return True
    finally:
        await r.aclose()


@router.websocket("/ws/meal-plans/{plan_id}/status")
async def meal_plan_status(
    websocket: WebSocket, plan_id: str, ticket: str = ""
) -> None:
    """WebSocket endpoint for meal-plan generation progress."""

    # Validate ticket
    if not ticket or not await _validate_ticket(ticket):
        await websocket.close(code=4001, reason="Invalid or expired ticket")
        return

    await websocket.accept()

    # Register connection
    if plan_id not in _connections:
        _connections[plan_id] = []
    _connections[plan_id].append(websocket)

    _logger.info("WebSocket connected for plan %s", plan_id)

    try:
        # Keep connection alive until client disconnects or server pushes final event
        while True:
            # Wait for client messages (ping/pong or disconnect)
            data = await websocket.receive_text()
            # Client can send "ping" for keepalive
            if data == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))
    except WebSocketDisconnect:
        _logger.info("WebSocket disconnected for plan %s", plan_id)
    finally:
        # Unregister
        if plan_id in _connections:
            _connections[plan_id] = [
                ws for ws in _connections[plan_id] if ws is not websocket
            ]
            if not _connections[plan_id]:
                del _connections[plan_id]


async def broadcast_progress(plan_id: str, payload: Dict[str, Any]) -> None:
    """Push a progress/completion/failure event to all connected clients for a plan."""

    websockets = _connections.get(plan_id, [])
    if not websockets:
        return

    message = json.dumps(payload)
    closed: list[WebSocket] = []

    for ws in websockets:
        try:
            await ws.send_text(message)
        except Exception:
            _logger.debug("Failed to send to WebSocket for plan %s, removing", plan_id)
            closed.append(ws)

    # Clean up closed connections
    for ws in closed:
        if plan_id in _connections:
            _connections[plan_id] = [w for w in _connections[plan_id] if w is not ws]
