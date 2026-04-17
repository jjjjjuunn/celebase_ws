# syntax=docker/dockerfile:1.7

# ---- builder ----------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /repo

# pnpm via corepack — version-pinned in package.json packageManager field.
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy workspace manifests first for layer caching.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/service-core/package.json packages/service-core/
COPY services/content-service/package.json services/content-service/

# Fetch into pnpm content-addressable store (no install yet).
RUN pnpm fetch

# Now copy sources and install from store (offline).
COPY packages/shared-types packages/shared-types
COPY packages/service-core packages/service-core
COPY services/content-service services/content-service

RUN pnpm install --frozen-lockfile --offline \
    --filter @celebbase/shared-types... \
    --filter @celebbase/service-core... \
    --filter @celebbase/content-service...

# Build workspace packages (turborepo handles order via ^build).
RUN pnpm --filter @celebbase/content-service... build

# Flatten workspace deps into a stand-alone bundle for the runtime stage.
RUN pnpm --filter @celebbase/content-service deploy --prod /deploy

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder --chown=app:app /deploy /app

USER app
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "dist/index.js"]
