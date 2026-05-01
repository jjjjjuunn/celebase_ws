# syntax=docker/dockerfile:1.7

# ---- builder ----------------------------------------------------------------
FROM python:3.12-slim AS builder
WORKDIR /build

# Build-time deps for asyncpg / PyJWT[crypto] native extensions.
RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY services/meal-plan-engine/requirements.txt ./
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---- runtime ----------------------------------------------------------------
FROM python:3.12-slim AS runtime
RUN groupadd -r app && useradd -r -g app app
WORKDIR /app

COPY --from=builder /install /usr/local

COPY --chown=app:app services/meal-plan-engine/main.py ./
COPY --chown=app:app services/meal-plan-engine/src ./src
COPY --chown=app:app services/meal-plan-engine/prompts ./prompts

USER app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=3003 \
    HOST=0.0.0.0
EXPOSE 3003
CMD ["python", "main.py"]
