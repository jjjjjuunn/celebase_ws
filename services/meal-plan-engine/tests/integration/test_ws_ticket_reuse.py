"""T3 — WebSocket ticket single-use E2E.

Verifies that a ticket obtained via ``POST /ws/ticket`` grants exactly ONE
WebSocket session. The second connect with the same ticket must be rejected
because ``_validate_ticket`` does ``GET → DEL`` on the Redis key
(websocket.py:32-46) before ``accept()``.

Rejection paths (both handled — Starlette/Uvicorn can choose either):
- Path A — HTTP 403 during the upgrade handshake. ``close(4001)`` before
  ``accept()`` maps to a 403 status in Uvicorn's WS impl. Manifests as
  ``InvalidStatus`` / ``InvalidStatusCode`` from the client.
- Path B — close frame after accept. Manifests as ``ConnectionClosedError``.

``OSError`` / ``ConnectionRefusedError`` are re-raised: the container is down,
not the ticket being rejected — failing fast surfaces the real cause.

Usable-session definition: helper returns ``pong=True`` only after a full
``send("ping") → recv() → {"event":"pong"}`` round-trip within 2s. A recv
timeout is not treated as a usable session.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, Dict

import pytest
import websockets
from websockets.exceptions import ConnectionClosedError

pytestmark = pytest.mark.integration

try:
    from websockets.exceptions import InvalidStatus  # websockets >= 12
except ImportError:  # pragma: no cover
    InvalidStatus = None  # type: ignore[assignment]

try:
    from websockets.exceptions import InvalidStatusCode  # deprecated alias
except ImportError:  # pragma: no cover
    InvalidStatusCode = None  # type: ignore[assignment]

WS_BASE = "ws://localhost:3003"
PONG_TIMEOUT_S = 2.0


async def _attempt_ws_connect(uri: str) -> Dict[str, Any]:
    """Attempt a WS connect + ping/pong round-trip.

    Returns:
        {"ok": True, "pong": True}  — handshake succeeded AND server replied with
                                       {"event":"pong"} within PONG_TIMEOUT_S.
        {"ok": False, "reason": "http_reject", "status": int}
                                      — server rejected during upgrade (Path A).
        {"ok": False, "reason": "closed_after_accept", "code": int}
                                      — server closed after accept (Path B).

    Raises:
        OSError / ConnectionRefusedError — network / container failure. Test
        MUST fail-fast rather than swallow these as expected rejections.
    """
    try:
        async with websockets.connect(uri) as ws:
            await ws.send("ping")
            raw = await asyncio.wait_for(ws.recv(), timeout=PONG_TIMEOUT_S)
            payload = json.loads(raw)
            pong = payload.get("event") == "pong"
            return {"ok": True, "pong": pong}
    except Exception as exc:  # noqa: BLE001 — classify below
        if InvalidStatus is not None and isinstance(exc, InvalidStatus):
            return {
                "ok": False,
                "reason": "http_reject",
                "status": exc.response.status_code,
            }
        if InvalidStatusCode is not None and isinstance(exc, InvalidStatusCode):
            return {"ok": False, "reason": "http_reject", "status": exc.status_code}
        if isinstance(exc, ConnectionClosedError):
            return {"ok": False, "reason": "closed_after_accept", "code": exc.code}
        raise


@pytest.mark.asyncio
async def test_t3_ws_ticket_single_use(seed_user, http_user_service) -> None:
    auth = {"Authorization": f"Bearer {seed_user['jwt']}"}

    # 1) Obtain ticket.
    r = await http_user_service.post("/ws/ticket", headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    ticket = body["ticket"]
    assert ticket.startswith("ws_"), body
    assert body["expires_in_sec"] == 30, body

    # 2) Build a WS URI. The handler does not validate plan existence, so a
    #    random UUID is fine — ticket validation is the gate under test.
    plan_id = str(uuid.uuid4())
    uri = f"{WS_BASE}/ws/meal-plans/{plan_id}/status?ticket={ticket}"

    # 3) First connect: must be fully usable (handshake + pong round-trip).
    first = await _attempt_ws_connect(uri)
    assert first == {"ok": True, "pong": True}, first

    # 4) Second connect with the same ticket: must be rejected. Accept either
    #    Path A (http_reject / 403) or Path B (closed_after_accept).
    second = await _attempt_ws_connect(uri)
    assert second["ok"] is False, second
    assert second["reason"] in ("http_reject", "closed_after_accept"), second
    if second["reason"] == "http_reject":
        assert second["status"] == 403, second
