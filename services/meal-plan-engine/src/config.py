"""Application settings loaded from environment variables using Pydantic v2."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Runtime configuration for the meal-plan-engine service."""

    PORT: int = 3003
    HOST: str = "0.0.0.0"

    # AsyncPG DSN, e.g. postgresql://user:pass@localhost:5432/celebase
    DATABASE_URL: str

    JWT_SECRET: str = "dev-secret-not-for-prod"
    CONTENT_SERVICE_URL: str = "http://localhost:3002"
    USER_SERVICE_URL: str = "http://localhost:3001"
    LOG_LEVEL: str = "INFO"

    model_config = {
        "env_file": ".env",
        "extra": "ignore",
    }


# The singleton settings instance imported across the codebase.
settings = Settings()  # type: ignore[arg-type]

