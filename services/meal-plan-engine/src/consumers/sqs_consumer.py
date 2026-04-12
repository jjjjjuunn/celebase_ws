"""SQS consumer for meal-plan generation jobs.

Polls an SQS queue for ``queued`` meal plans, runs the AI engine pipeline,
and updates the DB status through the lifecycle:
``queued → generating → completed | failed``.

Retry policy (spec §4.2):
- 1 automatic retry on internal engine errors
- After 2 consecutive failures the message moves to DLQ (SQS redrive)
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict

import boto3

from src.config import settings
from src.database import get_pool
from src.repositories import meal_plan_repository as repo
from src.clients import content_client, user_client
from src.engine.pipeline import run_pipeline
from src.engine.allergen_filter import RecipeSlot

_logger = logging.getLogger(__name__)

_MAX_RETRIES = 1


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
            )
        )
    return slots


async def _process_message(message_body: Dict[str, Any]) -> None:
    """Process a single SQS message: fetch data, run pipeline, update DB."""

    plan_id = message_body["plan_id"]
    user_id = message_body["user_id"]
    base_diet_id = message_body["base_diet_id"]
    auth_token = message_body.get("auth_token", "")

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
        )
        for r in recipes
    ]

    # Get plan preferences
    plan_row = await repo.get_meal_plan(pool, plan_id, user_id)
    preferences = plan_row.get("preferences", {}) if plan_row else {}

    # Progress callback (no-op for SQS — WebSocket layer handles real-time push)
    async def on_progress(payload: Dict[str, Any]) -> None:
        _logger.info("plan=%s progress: %s", plan_id, payload)

    # Run engine
    result = await run_pipeline(
        plan_id=plan_id,
        base_diet=base_diet,
        bio_profile=bio_profile,
        preferences=preferences,
        candidate_pool=candidate_pool,
        on_progress=on_progress,
    )

    # Persist result
    await repo.update_meal_plan(pool, plan_id, user_id, {
        "status": "completed",
        "daily_plans": result.get("weekly_plan", []),
        "adjustments": {
            "target_kcal": result.get("target_kcal"),
            "macros": result.get("macros"),
        },
    })

    _logger.info("plan=%s generation completed", plan_id)


async def start_consumer(queue_url: str) -> None:
    """Long-poll SQS and process meal-plan generation messages.

    This function runs indefinitely.  It is designed to be launched as a
    background task during application startup.
    """

    sqs = boto3.client("sqs", region_name=settings.AWS_REGION if hasattr(settings, "AWS_REGION") else "us-east-1")

    _logger.info("SQS consumer started, polling %s", queue_url)

    while True:
        response = sqs.receive_message(
            QueueUrl=queue_url,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=20,  # long poll
            VisibilityTimeout=120,  # 2 min to process
        )

        messages = response.get("Messages", [])
        if not messages:
            continue

        for msg in messages:
            receipt_handle = msg["ReceiptHandle"]
            retries = 0

            try:
                body = json.loads(msg["Body"])
                await _process_message(body)
                sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt_handle)

            except Exception:
                retries += 1
                _logger.exception(
                    "Failed to process message (attempt %d/%d)",
                    retries,
                    _MAX_RETRIES + 1,
                )

                if retries <= _MAX_RETRIES:
                    # Let SQS redeliver after visibility timeout expires
                    _logger.info("Will retry after visibility timeout")
                else:
                    # 2 consecutive failures → message goes to DLQ via SQS redrive policy
                    _logger.error("Max retries exceeded, message will move to DLQ")
                    sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt_handle)

                # Mark plan as failed in DB
                try:
                    body = json.loads(msg["Body"])
                    db_pool = await get_pool()
                    await repo.update_meal_plan(
                        db_pool,
                        body["plan_id"],
                        body["user_id"],
                        {"status": "failed"},
                    )
                except Exception:
                    _logger.exception("Failed to update plan status to failed")
