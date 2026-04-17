"""T1 — happy path E2E.

Requires docker compose stack to be up with migrations applied.

Primary completion signal: DB status polling (robust against WS no-replay).
WS: secondary — best-effort observation, handshake success only.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, List

import pytest
import websockets

WS_BASE = "ws://localhost:3003"
POLL_TIMEOUT_S = 60.0
POLL_INTERVAL_S = 1.0


@pytest.mark.asyncio
async def test_t1_happy_path(
    seed_user,
    seed_base_diet,
    clear_sqs_queue,
    http_user_service,
    http_mpe,
) -> None:
    auth = {"Authorization": f"Bearer {seed_user['jwt']}"}

    # 1) WS ticket from user-service
    r = await http_user_service.post("/ws/ticket", headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    ticket = body["ticket"]
    assert ticket.startswith("ws_"), body

    # 2) Enqueue generation (base_diet_id + duration_days only — no celebrity_slug)
    r = await http_mpe.post(
        "/meal-plans/generate",
        json={"base_diet_id": seed_base_diet["diet_id"], "duration_days": 7},
        headers=auth,
    )
    assert r.status_code in (200, 201), r.text
    gen = r.json()
    plan_id = gen["id"]
    assert gen["status"] == "queued", gen

    # 3) Launch WS observer in background (secondary — handshake + opportunistic events)
    progress: List[Any] = []
    ws_opened = False
    ws_uri = f"{WS_BASE}/ws/meal-plans/{plan_id}/status?ticket={ticket}"

    async def _ws_observer() -> None:
        nonlocal ws_opened
        try:
            async with websockets.connect(ws_uri) as ws:
                ws_opened = True
                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    except asyncio.TimeoutError:
                        continue
                    except websockets.ConnectionClosed:
                        break
                    progress.append(json.loads(raw))
        except Exception:
            pass  # WS race / teardown — not primary signal

    ws_task = asyncio.create_task(_ws_observer())

    # 4) Primary signal: poll DB status until completed (up to 60s)
    plan: dict | None = None
    deadline = time.monotonic() + POLL_TIMEOUT_S
    while time.monotonic() < deadline:
        r = await http_mpe.get(f"/meal-plans/{plan_id}", headers=auth)
        assert r.status_code == 200, r.text
        plan = r.json()
        if plan["status"] == "completed":
            break
        if plan["status"] == "failed":
            pytest.fail(f"plan failed: {plan}")
        await asyncio.sleep(POLL_INTERVAL_S)

    ws_task.cancel()
    try:
        await ws_task
    except asyncio.CancelledError:
        pass

    # 5) Final assertions
    assert plan is not None, "plan never fetched"
    assert plan["status"] == "completed", plan
    daily_plans = plan["daily_plans"]
    # asyncpg may return JSONB as a JSON-encoded string (no codec set) — parse if so
    if isinstance(daily_plans, str):
        daily_plans = json.loads(daily_plans)
    assert len(daily_plans) == 7, f"expected 7 daily plans, got {len(daily_plans)}"
    # WS secondary: require only that the handshake succeeded.
    assert ws_opened, "WS handshake did not complete"
