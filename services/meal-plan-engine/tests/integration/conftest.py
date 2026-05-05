"""Integration fixtures — require docker compose stack running on host ports.

Assumes:
- postgres on localhost:5432 (celebbase/devpw/celebbase_dev) with migrations applied
- user-service on localhost:3001
- meal-plan-engine on localhost:3003
- LocalStack SQS on localhost:4566 with queue 'meal-plan-generation'
"""

from __future__ import annotations

import os

import pytest

if not os.getenv("LOCALSTACK_ENDPOINT"):
    pytest.skip(
        "integration tests require LOCALSTACK_ENDPOINT",
        allow_module_level=True,
    )

import time
import uuid
from typing import Dict

import asyncpg
import boto3
import httpx
import jwt as pyjwt
import pytest_asyncio
from botocore.exceptions import ClientError

TEST_DB_URL = os.environ.get(
    "INTEGRATION_DATABASE_URL",
    "postgresql://celebbase:devpw@localhost:5432/celebbase_dev",
)
TEST_JWT_SECRET = os.environ.get("INTERNAL_JWT_SECRET", "dev-secret-not-for-prod")
USER_SERVICE_URL = os.environ.get("INTEGRATION_USER_SVC_URL", "http://localhost:3001")
MPE_URL = os.environ.get("INTEGRATION_MPE_URL", "http://localhost:3003")
SQS_ENDPOINT = os.environ.get("INTEGRATION_SQS_ENDPOINT", "http://localhost:4566")
SQS_QUEUE_URL = os.environ.get(
    "INTEGRATION_SQS_QUEUE_URL",
    "http://localhost:4566/000000000000/meal-plan-generation",
)

_TRUNCATE_SQL = """
TRUNCATE TABLE meal_plans, recipes, base_diets, celebrities,
               bio_profiles, subscriptions, users
RESTART IDENTITY CASCADE;
"""


@pytest_asyncio.fixture
async def db_pool():
    pool = await asyncpg.create_pool(TEST_DB_URL, min_size=1, max_size=3)
    try:
        yield pool
    finally:
        await pool.close()


@pytest_asyncio.fixture(autouse=True)
async def clean_db(db_pool):
    async with db_pool.acquire() as conn:
        await conn.execute(_TRUNCATE_SQL)
    yield


def _mint_jwt(user_id: str) -> str:
    now = int(time.time())
    return pyjwt.encode(
        {"sub": user_id, "token_use": "access", "iat": now, "exp": now + 3600},
        TEST_JWT_SECRET,
        algorithm="HS256",
    )


@pytest_asyncio.fixture
async def seed_user(clean_db, db_pool) -> Dict[str, str]:
    suffix = uuid.uuid4().hex[:12]
    async with db_pool.acquire() as conn:
        user_id = await conn.fetchval(
            """
            INSERT INTO users (cognito_sub, email, display_name, subscription_tier)
            VALUES ($1, $2, $3, 'premium')
            RETURNING id
            """,
            f"cog_test_{suffix}",
            f"test+{suffix}@celebbase.test",
            "Test User",
        )
        # Mirror values that user-service `recalculate()` would compute for this
        # profile: BMR (Mifflin-St Jeor, male) = 10*70 + 6.25*175 - 5*36 + 5 = 1619;
        # TDEE = BMR * 1.55 (moderate) ≈ 2509; target_kcal = TDEE for maintenance.
        # Without these the pipeline TypeErrors on `tdee <= 0` (None comparison).
        await conn.execute(
            """
            INSERT INTO bio_profiles (
                user_id, birth_year, sex, height_cm, weight_kg,
                activity_level, primary_goal, diet_type,
                bmr_kcal, tdee_kcal, target_kcal, macro_targets
            )
            VALUES ($1, 1990, 'male', 175.0, 70.0,
                    'moderate', 'maintenance', 'omnivore',
                    1619, 2509, 2509,
                    '{"protein_g":188,"carbs_g":314,"fat_g":84,"fiber_g":30}'::jsonb)
            """,
            user_id,
        )
        await conn.execute(
            """
            INSERT INTO subscriptions (
                user_id, tier, status,
                current_period_start, current_period_end
            )
            VALUES ($1, 'premium', 'active', NOW(), NOW() + INTERVAL '30 days')
            """,
            user_id,
        )
    uid = str(user_id)
    return {"user_id": uid, "jwt": _mint_jwt(uid)}


@pytest_asyncio.fixture
async def seed_base_diet(clean_db, db_pool) -> Dict[str, str]:
    async with db_pool.acquire() as conn:
        celeb_id = await conn.fetchval(
            """
            INSERT INTO celebrities (slug, display_name, avatar_url, category)
            VALUES ('test-celebrity', 'Test Celebrity',
                    'https://example.com/avatar.png', 'general')
            RETURNING id
            """,
        )
        diet_id = await conn.fetchval(
            """
            INSERT INTO base_diets (
                celebrity_id, name, diet_type, avg_daily_kcal, macro_ratio
            )
            VALUES ($1, 'Test Diet', 'omnivore', 2000,
                    '{"protein":30,"carb":40,"fat":30}'::jsonb)
            RETURNING id
            """,
            celeb_id,
        )
        for meal_type in ("breakfast", "lunch", "dinner", "snack"):
            await conn.execute(
                """
                INSERT INTO recipes (
                    base_diet_id, title, slug, meal_type,
                    nutrition, instructions
                )
                VALUES ($1, $2, $3, $4,
                        '{"kcal":500,"protein_g":30,"carb_g":50,"fat_g":20}'::jsonb,
                        '[]'::jsonb)
                """,
                diet_id,
                f"Test {meal_type.title()}",
                f"test-{meal_type}",
                meal_type,
            )
    return {"diet_id": str(diet_id)}


@pytest.fixture
def clear_sqs_queue() -> None:
    client = boto3.client(
        "sqs",
        endpoint_url=SQS_ENDPOINT,
        region_name="us-east-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",
    )
    try:
        client.purge_queue(QueueUrl=SQS_QUEUE_URL)
    except ClientError as exc:
        # LocalStack: PurgeQueue can only be called once per 60s
        if exc.response["Error"]["Code"] != "PurgeQueueInProgress":
            raise


@pytest.fixture
def sqs_client():
    return boto3.client(
        "sqs",
        endpoint_url=SQS_ENDPOINT,
        region_name="us-east-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",
    )


@pytest_asyncio.fixture
async def http_user_service():
    async with httpx.AsyncClient(base_url=USER_SERVICE_URL, timeout=10.0) as c:
        yield c


@pytest_asyncio.fixture
async def http_mpe():
    async with httpx.AsyncClient(base_url=MPE_URL, timeout=10.0) as c:
        yield c
