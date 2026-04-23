"""Application entrypoint for the *meal-plan-engine* FastAPI service."""

from __future__ import annotations

# Configure structured JSON logging BEFORE any module-level getLogger() calls.
from src.config import settings as _settings_early
from src.logging_config import configure_logging

configure_logging(level=_settings_early.LOG_LEVEL)

import asyncio
import logging
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.config import settings
from src.database import close_pool, init_pool
from src.api.websocket import router as ws_router
from src.routes.meal_plans import router as meal_plans_router

_logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan management
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: D401  # pylint: disable=unused-argument
    """Initialise and tear down shared resources (DB pool, etc.)."""

    _logger.info("Initialising DB pool …")
    try:
        await init_pool(settings.DATABASE_URL)
    except Exception as exc:  # pragma: no cover  # pylint: disable=broad-except
        _logger.exception("Failed to connect to database: %s", exc)
        raise

    # Start SQS consumer as background task if queue URL is configured
    consumer_task: asyncio.Task[None] | None = None
    if settings.SQS_QUEUE_URL:
        from src.consumers.sqs_consumer import start_consumer

        consumer_task = asyncio.create_task(start_consumer(settings.SQS_QUEUE_URL))
        _logger.info("SQS consumer started for %s", settings.SQS_QUEUE_URL)

    yield

    # Shutdown: cancel consumer before closing DB pool
    if consumer_task and not consumer_task.done():
        consumer_task.cancel()
        try:
            await consumer_task
        except asyncio.CancelledError:
            pass

    _logger.info("Closing DB pool …")
    await close_pool()


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------


app = FastAPI(title="meal-plan-engine", lifespan=lifespan)


# CORS (H3) -----------------------------------------------------------------


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global error handler (H4) -------------------------------------------------


@app.exception_handler(Exception)
async def _unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    request_id = request.headers.get("x-request-id", str(uuid4()))
    _logger.exception("Unhandled exception: %s", exc, extra={"requestId": request_id})
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred",
                "requestId": request_id,
            }
        },
    )


# Health check (H5) ----------------------------------------------------------


@app.get("/health", include_in_schema=False)
async def health_check():
    return {"status": "ok", "version": settings.APP_VERSION}


# Routers --------------------------------------------------------------------


app.include_router(meal_plans_router, prefix="/meal-plans")
app.include_router(ws_router)  # WS path is absolute on the router — do not prefix.


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
