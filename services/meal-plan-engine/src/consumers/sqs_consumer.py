"""SQS consumer for meal-plan generation jobs.

Polls an SQS queue for ``queued`` meal plans, runs the AI engine pipeline,
and updates the DB status through the lifecycle:
``queued → generating → completed | failed``.

Retry policy (spec §4.2):
- 1 automatic retry on internal engine errors
- After 2 consecutive failures the message moves to DLQ (SQS redrive)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import boto3

from src.api.websocket import broadcast_progress
from src.config import settings
from src.database import get_pool
from src.repositories import meal_plan_repository as repo
from src.clients import content_client, user_client
from src.engine.pipeline import run_pipeline
from src.engine.allergen_filter import RecipeSlot
from src.services.sqs_publisher import PlanGenerationMessage

_logger = logging.getLogger(__name__)

_MAX_RETRIES = 1

_VISIBILITY_TIMEOUT: int = int(os.environ.get("SQS_VISIBILITY_TIMEOUT", "120"))

# Per-message retry tracking keyed by SQS MessageId.
# Entries are removed on success or terminal failure to prevent memory growth.
_retry_counts: dict[str, int] = {}


async def _build_candidate_pool(recipes: list[Dict[str, Any]]) -> list[RecipeSlot]:
    """Convert raw recipe dicts into RecipeSlot objects for the engine."""

    slots: list[RecipeSlot] = []
    for r in recipes:
        slots.append(
            RecipeSlot(
                recipe_id=str(r.get("id", "")),
                meal_type=r.get("meal_type", "lunch"),
                allergens=r.get("allergens", []),
                ingredients=r.get("ingredients", []),
                nutrition=r.get("nutrition"),
            )
        )
    return slots


async def _process_message(message_body: Dict[str, Any]) -> None:
    """Process a single SQS message: fetch data, run pipeline, update DB."""

    msg = PlanGenerationMessage.model_validate(message_body)
    plan_id = str(msg.plan_id)
    user_id = str(msg.user_id)
    base_diet_id = str(msg.base_diet_id)
    auth_token = msg.auth_token
    duration_days = msg.duration_days

    pool = await get_pool()

    # Mark as generating
    await repo.update_meal_plan(pool, plan_id, user_id, {"status": "generating"})

    # Fetch external data
    base_diet = await content_client.get_base_diet(base_diet_id)
    recipes = await content_client.get_recipes_for_diet(base_diet_id)
    bio_profile = await user_client.get_bio_profile(user_id, auth_token)

    # Build candidate pool from all diet recipes
    candidate_pool = await _build_candidate_pool(recipes)

    # Attach recipes to base_diet for pipeline consumption
    base_diet["recipes"] = [
        RecipeSlot(
            recipe_id=str(r.get("id", "")),
            meal_type=r.get("meal_type", "lunch"),
            allergens=r.get("allergens", []),
            ingredients=r.get("ingredients", []),
            nutrition=r.get("nutrition"),
        )
        for r in recipes
    ]

    # Get plan preferences
    plan_row = await repo.get_meal_plan(pool, plan_id, user_id)
    preferences = (plan_row.get("preferences") or {}) if plan_row else {}

    # Progress callback → WebSocket broadcast (IMPL-014-a)
    async def on_progress(payload: Dict[str, Any]) -> None:
        _logger.info("plan=%s progress: %s", plan_id, payload)
        await broadcast_progress(plan_id, payload)

    # Run engine
    result = await run_pipeline(
        plan_id=plan_id,
        base_diet=base_diet,
        bio_profile=bio_profile,
        preferences=preferences,
        candidate_pool=candidate_pool,
        duration_days=duration_days,
        on_progress=on_progress,
    )

    # Persist result
    await repo.update_meal_plan(
        pool,
        plan_id,
        user_id,
        {
            "status": "completed",
            "daily_plans": result.get("weekly_plan", []),
            "adjustments": {
                "target_kcal": result.get("target_kcal"),
                "macros": result.get("macros"),
            },
        },
    )

    _logger.info("plan=%s generation completed", plan_id)


async def _recover_stuck_plans() -> None:
    """Mark plans stuck in 'generating' for >5 min as 'failed'.

    Called once at consumer startup to recover from previous crashes.
    Limitation: assumes single-instance deployment. Multi-instance
    requires a lease/heartbeat pattern (Phase B).
    """
    pool = await get_pool()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE meal_plans SET status = 'failed', updated_at = NOW() "
            "WHERE status = 'generating' AND updated_at < $1 AND deleted_at IS NULL",
            cutoff,
        )
    _logger.info("Recovered stuck plans: %s", result)


async def start_consumer(queue_url: str) -> None:
    """Long-poll SQS and process meal-plan generation messages.

    This function runs indefinitely.  It is designed to be launched as a
    background task during application startup.
    """

    # NOTE: boto3 clients are not thread-safe when shared across threads.
    # This is safe here because only one to_thread call is in flight at a time
    # (single-loop design). Do NOT add concurrent workers without per-thread clients.
    sqs = boto3.client(
        "sqs",
        region_name=settings.AWS_REGION,
        endpoint_url=settings.AWS_ENDPOINT_URL,
    )

    _logger.info("SQS consumer started, polling %s", queue_url)

    # Recover plans stuck from previous crashes
    await _recover_stuck_plans()

    consecutive_errors = 0

    while True:
        try:
            response = await asyncio.to_thread(
                sqs.receive_message,
                QueueUrl=queue_url,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=20,
                VisibilityTimeout=_VISIBILITY_TIMEOUT,
            )
            consecutive_errors = 0

            messages = response.get("Messages", [])
            if not messages:
                continue

            for msg in messages:
                message_id = msg["MessageId"]
                receipt_handle = msg["ReceiptHandle"]

                # Pre-extract IDs before processing (avoids re-parse in exception handler)
                plan_id = "unknown"
                user_id = "unknown"

                try:
                    body = json.loads(msg["Body"])
                    plan_id = body.get("plan_id", "unknown")
                    user_id = body.get("user_id", "unknown")

                    await _process_message(body)

                    await asyncio.to_thread(
                        sqs.delete_message,
                        QueueUrl=queue_url,
                        ReceiptHandle=receipt_handle,
                    )
                    _retry_counts.pop(message_id, None)

                except Exception:
                    retries = _retry_counts.get(message_id, 0) + 1
                    _retry_counts[message_id] = retries

                    _logger.exception(
                        "Failed to process message (attempt %d/%d), plan=%s",
                        retries,
                        _MAX_RETRIES + 1,
                        plan_id,
                    )

                    if retries > _MAX_RETRIES:
                        _logger.error(
                            "Max retries exceeded for plan=%s, deleting message (DLQ via redrive)",
                            plan_id,
                        )
                        await asyncio.to_thread(
                            sqs.delete_message,
                            QueueUrl=queue_url,
                            ReceiptHandle=receipt_handle,
                        )
                        _retry_counts.pop(message_id, None)

                    # Mark plan as failed in DB
                    if plan_id != "unknown":
                        try:
                            db_pool = await get_pool()
                            await repo.update_meal_plan(
                                db_pool,
                                plan_id,
                                user_id,
                                {"status": "failed"},
                            )
                        except Exception:
                            _logger.exception("Failed to update plan status to failed")

        except asyncio.CancelledError:
            _logger.info("SQS consumer cancelled, shutting down")
            raise
        except Exception:
            consecutive_errors += 1
            backoff = min(5 * (2**consecutive_errors), 300)
            _logger.exception("SQS poll error, retrying in %ds", backoff)
            await asyncio.sleep(backoff)
