"""T2 — SQS DLQ retry E2E.

Verifies that a poison message (phantom `base_diet_id`) is retried once
then dropped from the main queue while the meal_plans row transitions to
``status='failed'``. Requires docker compose stack with
``SQS_VISIBILITY_TIMEOUT=10`` so the retry window is short enough for a
60s test budget.

Failure vector: the consumer reads ``base_diet_id`` from the SQS message
body (sqs_consumer.py:62) and calls ``content_client.get_base_diet()``
— a phantom UUID yields a 404 which raises and enters the retry path.
The meal_plans row itself carries a valid ``base_diet_id`` to satisfy
the FK to ``base_diets(id)``.
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.integration

POLL_TIMEOUT_S = 60.0
POLL_INTERVAL_S = 1.0
DRAIN_TIMEOUT_S = 15.0
DRAIN_CONSECUTIVE_ZEROS = 3

SQS_QUEUE_URL = "http://localhost:4566/000000000000/meal-plan-generation"


@pytest.mark.asyncio
async def test_t2_dlq_retry(
    seed_user,
    seed_base_diet,
    clear_sqs_queue,
    db_pool,
    sqs_client,
    http_mpe,
) -> None:
    auth = {"Authorization": f"Bearer {seed_user['jwt']}"}
    user_id = seed_user["user_id"]
    valid_base_diet_id = seed_base_diet["diet_id"]
    phantom_base_diet_id = str(uuid.uuid4())

    # 1) Insert meal_plans row with valid FK (status='queued' so _recover_stuck_plans won't touch it).
    start = date.today()
    end = start + timedelta(days=7)
    async with db_pool.acquire() as conn:
        plan_id = await conn.fetchval(
            """
            INSERT INTO meal_plans (
                user_id, base_diet_id, status, start_date, end_date, daily_plans
            )
            VALUES ($1, $2, 'queued', $3, $4, '{}'::jsonb)
            RETURNING id
            """,
            uuid.UUID(user_id),
            uuid.UUID(valid_base_diet_id),
            start,
            end,
        )
    plan_id = str(plan_id)

    # 2) Send raw SQS message with DIFFERENT phantom base_diet_id (the failure vector).
    body = {
        "plan_id": plan_id,
        "user_id": user_id,
        "base_diet_id": phantom_base_diet_id,
        "duration_days": 7,
        "auth_token": seed_user["jwt"],
        "idempotency_key": f"t2-{uuid.uuid4()}",
        "preferences": {},
    }
    sqs_client.send_message(QueueUrl=SQS_QUEUE_URL, MessageBody=json.dumps(body))

    # 3) Poll status endpoint until 'failed' (consumer retries once, then terminal).
    deadline = time.monotonic() + POLL_TIMEOUT_S
    plan: dict | None = None
    while time.monotonic() < deadline:
        r = await http_mpe.get(f"/meal-plans/{plan_id}", headers=auth)
        assert r.status_code == 200, r.text
        plan = r.json()
        if plan["status"] == "failed":
            break
        await asyncio.sleep(POLL_INTERVAL_S)

    assert plan is not None and plan["status"] == "failed", plan

    # 4) Drain-stability: require DRAIN_CONSECUTIVE_ZEROS consecutive "0+0" reads.
    #    LocalStack counters can lag by a poll cycle; a single read is brittle.
    consecutive_zeros = 0
    drain_deadline = time.monotonic() + DRAIN_TIMEOUT_S
    while time.monotonic() < drain_deadline:
        attrs = sqs_client.get_queue_attributes(
            QueueUrl=SQS_QUEUE_URL,
            AttributeNames=[
                "ApproximateNumberOfMessages",
                "ApproximateNumberOfMessagesNotVisible",
            ],
        )["Attributes"]
        visible = attrs["ApproximateNumberOfMessages"]
        in_flight = attrs["ApproximateNumberOfMessagesNotVisible"]
        if visible == "0" and in_flight == "0":
            consecutive_zeros += 1
            if consecutive_zeros >= DRAIN_CONSECUTIVE_ZEROS:
                break
        else:
            consecutive_zeros = 0
        await asyncio.sleep(1.0)

    assert consecutive_zeros >= DRAIN_CONSECUTIVE_ZEROS, (
        f"queue never drained: visible={visible}, in_flight={in_flight}"
    )

    # 5) Final drain check — receive_message catches any lingering visible message
    #    that the attribute counters missed.
    receive = sqs_client.receive_message(
        QueueUrl=SQS_QUEUE_URL,
        MaxNumberOfMessages=1,
        WaitTimeSeconds=1,
    )
    assert not receive.get("Messages"), (
        f"queue unexpectedly has messages after drain: {receive['Messages']}"
    )
