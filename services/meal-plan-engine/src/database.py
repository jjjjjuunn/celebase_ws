"""AsyncPG connection pool helpers.

This module maintains a single global :class:`asyncpg.Pool` instance that is
created on application startup and closed on shutdown. Service components
should retrieve the pool via :func:`get_pool` to execute queries.
"""

from __future__ import annotations

import asyncpg

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:  # noqa: D401
    """Return the initialised global connection pool.

    Raises
    ------
    RuntimeError
        If the pool has not been initialised yet (application startup order
        problem).
    """

    global _pool  # pylint: disable=global-statement

    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool


async def init_pool(dsn: str) -> asyncpg.Pool:
    """Create the global connection *pool*.

    The pool is configured with a sensible concurrency range for a typical
    micro-service workload (2–20 connections).
    """

    global _pool  # pylint: disable=global-statement

    _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=20)
    return _pool


async def close_pool() -> None:  # noqa: D401
    """Close and clear the global connection pool."""

    global _pool  # pylint: disable=global-statement

    if _pool is not None:
        await _pool.close()
        _pool = None

