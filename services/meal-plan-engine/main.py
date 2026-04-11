"""Application entrypoint for the *meal-plan-engine* FastAPI service."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.config import settings
from src.database import close_pool, init_pool
from src.routes.meal_plans import router as meal_plans_router


# ---------------------------------------------------------------------------
# Lifespan management
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: D401  # pylint: disable=unused-argument
    """Initialise and tear down shared resources (DB pool, etc.)."""

    logging.getLogger(__name__).info("Initialising DB pool …")
    try:
        await init_pool(settings.DATABASE_URL)
    except Exception as exc:  # pragma: no cover  # pylint: disable=broad-except
        logging.getLogger(__name__).exception("Failed to connect to database: %s", exc)
        # Re-raise so FastAPI will halt the application start-up.
        raise

    yield

    logging.getLogger(__name__).info("Closing DB pool …")
    await close_pool()


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------


app = FastAPI(title="meal-plan-engine", lifespan=lifespan)


# Routers --------------------------------------------------------------------


app.include_router(meal_plans_router, prefix="/meal-plans")


# ---------------------------------------------------------------------------
# Local dev server (uvicorn main:app)
# ---------------------------------------------------------------------------


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        log_level=settings.LOG_LEVEL.lower(),
    )

