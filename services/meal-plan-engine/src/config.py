"""Application settings loaded from environment variables using Pydantic v2."""

from __future__ import annotations

from typing import List

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Runtime configuration for the meal-plan-engine service."""

    PORT: int = 3003
    HOST: str = "0.0.0.0"

    # AsyncPG DSN, e.g. postgresql://user:pass@localhost:5432/celebase
    DATABASE_URL: str

    NODE_ENV: str = "development"
    AUTH_PROVIDER: str = "dev"
    # Internal JWT secret — must match INTERNAL_JWT_SECRET in user-service
    INTERNAL_JWT_SECRET: str = "dev-secret-not-for-prod"
    INTERNAL_JWT_ISSUER: str = "celebbase-user-service"
    CORS_ORIGINS: str = (
        "http://localhost:3000,http://localhost:3001,http://localhost:3002"
    )
    CONTENT_SERVICE_URL: str = "http://localhost:3002"
    USER_SERVICE_URL: str = "http://localhost:3001"
    REDIS_URL: str = "redis://localhost:6379"
    SQS_QUEUE_URL: str = ""  # empty = consumer disabled in dev
    AWS_REGION: str = "us-east-1"
    AWS_ENDPOINT_URL: str | None = (
        None  # LocalStack dev override; None → real AWS in prod
    )
    LOG_LEVEL: str = "INFO"
    APP_VERSION: str = "0.1.0"

    # ── LLM Enhancement Layer (spec §5.8, IMPL-AI-001-c) ─────────────────────
    # OPENAI_API_KEY pattern sk-* is blocked by security.md Semgrep rules — env only
    OPENAI_API_KEY: str = ""
    ENABLE_LLM_MEAL_PLANNER: bool = False
    LLM_ROLLOUT_PCT: int = Field(default=0, ge=0, le=100)  # 0/10/50/100 점진적 rollout
    LLM_COST_CAP_USD: float = 0.05  # per-plan hard cap (Proposal line 305)
    LLM_INPUT_PRICE_PER_1M_USD: float = (
        0.10  # GPT-4.1-mini 기준, 갱신 필요 시 코드 변경
    )
    LLM_OUTPUT_PRICE_PER_1M_USD: float = 0.40
    LLM_MAX_INPUT_TOKENS: int = 3000
    LLM_MAX_OUTPUT_TOKENS: int = 800
    LLM_TIMEOUT_SECONDS: float = 5.0
    ELITE_DAILY_LLM_SOFT_LIMIT: int = 3  # Redis quota per user per day
    LLM_MONTHLY_WARN_USD: float = 500.0  # MAU 10K 기준 warn 임계값
    LLM_MONTHLY_KILL_USD: float = 1000.0  # kill switch 자동 발화 임계값
    OPENAI_MODEL: str = "gpt-4.1-mini"  # env override로 모델 변경 가능

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @model_validator(mode="after")
    def _reject_default_secret_in_prod(self) -> Settings:
        if (
            self.NODE_ENV == "production"
            and self.INTERNAL_JWT_SECRET == "dev-secret-not-for-prod"
        ):
            raise ValueError(
                "INTERNAL_JWT_SECRET must be set to a non-default value in production"
            )
        return self

    model_config = {
        "env_file": ".env",
        "extra": "ignore",
    }


# The singleton settings instance imported across the codebase.
settings = Settings()  # type: ignore[arg-type]
