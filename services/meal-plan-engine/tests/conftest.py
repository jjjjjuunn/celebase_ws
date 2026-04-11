"""Set required env vars before any module imports."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://localhost/celebase_test")
