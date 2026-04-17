"""SQS publisher for meal-plan generation jobs.

Boot-time invariant: ``SQS_QUEUE_URL`` must be set.
Test env (pytest in ``sys.modules`` or ``NODE_ENV=test``) is exempt to keep
unit tests hermetic.
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys
from typing import Any
from uuid import UUID

import boto3
from pydantic import BaseModel, Field

from src.config import settings

_logger = logging.getLogger(__name__)


class PlanGenerationMessage(BaseModel):
    """Strict envelope for SQS meal-plan generation messages (Codex #8)."""

    plan_id: UUID
    user_id: UUID
    base_diet_id: UUID
    duration_days: int = Field(ge=1, le=30)
    auth_token: str
    preferences: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str


def _is_test_env() -> bool:
    return "pytest" in sys.modules or settings.NODE_ENV == "test"


# Import-time boot check (Codex #1 — SQS in-process fallback 금지)
if not settings.SQS_QUEUE_URL and not _is_test_env():
    raise RuntimeError(
        "SQS_QUEUE_URL is not set. meal-plan-engine cannot start without SQS. "
        "Run LocalStack (IMPL-015 will add docker-compose) or set SQS_QUEUE_URL."
    )


async def enqueue_plan_job(msg: PlanGenerationMessage) -> None:
    """Publish a plan-generation job to SQS.

    Raises on SQS failure — caller must translate to HTTP 503 and mark plan failed.
    """
    sqs = boto3.client(
        "sqs",
        region_name=settings.AWS_REGION,
        endpoint_url=settings.AWS_ENDPOINT_URL,
    )
    body = msg.model_dump(mode="json")  # UUID → str
    await asyncio.to_thread(
        sqs.send_message,
        QueueUrl=settings.SQS_QUEUE_URL,
        MessageBody=json.dumps(body),
    )
    _logger.info("enqueued plan_id=%s duration_days=%d", msg.plan_id, msg.duration_days)
