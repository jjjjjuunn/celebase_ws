"""Structured JSON logging — mirrors service-core/src/logger.ts (pino)."""

from __future__ import annotations

import logging
import sys

from pythonjsonlogger import jsonlogger


def configure_logging(level: str = "INFO") -> None:
    """Install JSON formatter on the root logger.

    Must be called before any module creates a logger. Subsequent calls
    are idempotent (checks if a JsonFormatter handler is already installed).
    """
    root = logging.getLogger()

    for h in root.handlers:
        if isinstance(h.formatter, jsonlogger.JsonFormatter):
            return

    handler = logging.StreamHandler(sys.stdout)
    formatter = jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
        rename_fields={"levelname": "level", "asctime": "timestamp"},
    )
    handler.setFormatter(formatter)
    root.addHandler(handler)
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
