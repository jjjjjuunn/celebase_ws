# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS builder
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/service-core/package.json packages/service-core/
COPY services/analytics-service/package.json services/analytics-service/
RUN pnpm fetch
COPY packages/shared-types packages/shared-types
COPY packages/service-core packages/service-core
COPY services/analytics-service services/analytics-service
RUN pnpm install --frozen-lockfile --offline \
    --filter @celebbase/shared-types... \
    --filter @celebbase/service-core... \
    --filter @celebbase/analytics-service...
RUN pnpm --filter @celebbase/analytics-service... build
RUN pnpm --filter @celebbase/analytics-service deploy --prod /deploy

FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder --chown=app:app /deploy /app
USER app
ENV NODE_ENV=production
EXPOSE 3005
CMD ["node", "dist/index.js"]
