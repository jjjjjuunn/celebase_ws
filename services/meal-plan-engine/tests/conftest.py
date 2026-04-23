"""Set required env vars before any module imports."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://localhost/celebase_test")

import warnings
import pytest
warnings.filterwarnings("ignore", category=pytest.PytestRemovedIn9Warning)

import os
os.environ.setdefault("PYTEST_ASYNCIO_MODE", "auto")

import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch
from main import app

@pytest_asyncio.fixture(name="client")
async def _patched_client_fixture():
    """Replacement async client fixture compatible with pytest-asyncio 1.3+."""
    with patch("src.database.init_pool", new_callable=AsyncMock), patch(
        "src.database.close_pool", new_callable=AsyncMock
    ), patch("src.routes.meal_plans.get_pool", new_callable=AsyncMock) as mock_get_pool:
        mock_get_pool.return_value = AsyncMock()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:  # type: ignore[arg-type]
            yield c

import asyncio
import pytest

@pytest.fixture(name="client", scope="function")  # override with sync fixture
def _sync_client_fixture():
    from httpx import AsyncClient, ASGITransport  # local import to avoid optional deps
    from unittest.mock import AsyncMock, patch
    from main import app

    async def _make():
        with patch("src.database.init_pool", new_callable=AsyncMock), patch(
            "src.database.close_pool", new_callable=AsyncMock
        ), patch("src.routes.meal_plans.get_pool", new_callable=AsyncMock) as mock_get_pool:
            mock_get_pool.return_value = AsyncMock()
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:  # type: ignore[arg-type]
                return c

    client = asyncio.get_event_loop().run_until_complete(_make())
    yield client
    # nothing to cleanup
