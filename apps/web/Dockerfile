# syntax=docker/dockerfile:1.7
# apps/web — Next.js 15 BFF, standalone output, monorepo trace root.
# CHORE-MOBILE-STAGING-BFF-001 Phase A.

# ---- builder ----------------------------------------------------------------
FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS builder
WORKDIR /repo

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Workspace manifests first — pnpm fetch cache layer.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/ui-kit/package.json packages/ui-kit/
COPY packages/eslint-plugin-celebbase/package.json packages/eslint-plugin-celebbase/
COPY apps/web/package.json apps/web/

RUN pnpm fetch

# Source copy + offline install.
COPY packages/shared-types packages/shared-types
COPY packages/design-tokens packages/design-tokens
COPY packages/ui-kit packages/ui-kit
COPY packages/eslint-plugin-celebbase packages/eslint-plugin-celebbase
COPY apps/web apps/web

RUN pnpm install --frozen-lockfile --offline --filter web...

# NEXT_PUBLIC_* are baked into the build artifact (staging-only image).
# prod 분기 시 별도 build-arg 또는 runtime 주입 패턴 필요 (plan v3 OoS).
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_WS_HOST
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_PUBLIC_WS_HOST=${NEXT_PUBLIC_WS_HOST}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time only — next build's "Collecting page data" phase module-loads
# every BFF API route, whose top-level readEnv() (apps/web/src/app/api/_lib/
# {env,bff-fetch}.ts) requires these. Real values are injected at container
# start via env_file (apps/web/.env.staging). Builder-stage ENV does NOT
# propagate to the runtime stage in multi-stage builds, so these dummies
# are stripped from the final image.
ENV USER_SERVICE_URL=http://build-time-dummy:0
ENV CONTENT_SERVICE_URL=http://build-time-dummy:0
ENV COMMERCE_SERVICE_URL=http://build-time-dummy:0
ENV MEAL_PLAN_URL=http://build-time-dummy:0
ENV ANALYTICS_SERVICE_URL=http://build-time-dummy:0
ENV INTERNAL_JWT_SECRET=build-time-dummy-internal-jwt-secret-32-chars
ENV INTERNAL_JWT_ISSUER=celebbase-user-service
ENV COGNITO_HOSTED_UI_DOMAIN=build-time-dummy.local
ENV COGNITO_CLIENT_ID=build-time-dummy
ENV COGNITO_CLIENT_SECRET=build-time-dummy
ENV COGNITO_TOKEN_ENDPOINT=https://build-time-dummy.local/oauth2/token
ENV COGNITO_REDIRECT_URI=https://build-time-dummy.local/api/auth/callback

# Turbo ^build → shared-types tsc → design-tokens build → ui-kit copy-css → web build.
RUN pnpm --filter web... build

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS runtime
WORKDIR /app

RUN apk add --no-cache curl && \
    addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nextjs

# next.config.ts: output 'standalone' + outputFileTracingRoot = repo root.
# standalone tree shape: /repo/apps/web/.next/standalone/
#   ├─ apps/web/server.js       (Next.js entry)
#   ├─ apps/web/.next/...
#   ├─ node_modules/...         (traced deps from monorepo)
#   └─ packages/.../dist/...    (traced workspace packages)
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone/ ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static/ ./apps/web/.next/static/
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public/ ./apps/web/public/

# NEXT_PUBLIC_* must be baked into the runtime image — server-side routes
# (e.g. apps/web/src/app/api/ws-ticket/route.ts:17) call readEnv('NEXT_PUBLIC_WS_URL')
# at module load. Builder-stage ENV does not propagate to runtime stage in
# multi-stage builds, so re-declare ARG+ENV here.
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_WS_HOST
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_PUBLIC_WS_HOST=${NEXT_PUBLIC_WS_HOST}

USER nextjs
ENV PORT=3000 HOSTNAME=0.0.0.0 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["node", "apps/web/server.js"]
