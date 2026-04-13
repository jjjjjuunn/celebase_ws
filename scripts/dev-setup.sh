#!/usr/bin/env bash
# dev-setup.sh — One-command dev environment bootstrap.
#
# Usage:
#   scripts/dev-setup.sh          # full setup (docker + deps + migrate + seed)
#   scripts/dev-setup.sh --reset  # wipe DB volume and re-setup
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

RESET=false
[[ "${1:-}" == "--reset" ]] && RESET=true

# ── Color helpers ─────────────────────────────────────────────
info()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[setup]\033[0m %s\n' "$*"; }
err()   { printf '\033[1;31m[setup]\033[0m %s\n' "$*" >&2; }

# ── Pre-flight checks ────────────────────────────────────────
command -v docker >/dev/null 2>&1 || { err "docker not found. Install Docker Desktop first."; exit 1; }
command -v pnpm   >/dev/null 2>&1 || { err "pnpm not found. Run: npm install -g pnpm"; exit 1; }

if ! docker info >/dev/null 2>&1; then
  err "Docker daemon not running. Start Docker Desktop first."
  exit 1
fi

# ── Reset (optional) ─────────────────────────────────────────
if [[ "$RESET" == "true" ]]; then
  info "Stopping containers and removing DB volume..."
  docker compose down -v
fi

# ── .env file ─────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  info "Creating .env from .env.example..."
  cp .env.example .env
  ok ".env created — review and update secrets as needed."
else
  ok ".env already exists."
fi

# ── Docker services ───────────────────────────────────────────
info "Starting Postgres + Redis..."
docker compose up -d --build --wait

ok "Docker services healthy."

# ── Node dependencies ─────────────────────────────────────────
info "Installing pnpm dependencies..."
pnpm install --frozen-lockfile

# ── Build workspace packages ─────────────────────────────────
info "Building shared packages..."
pnpm --filter shared-types build
pnpm --filter service-core build

# ── Database migration ────────────────────────────────────────
info "Running migrations..."
DATABASE_URL="postgresql://celebbase:devpw@localhost:5432/celebbase_dev" \
  pnpm db:migrate

# ── Seed data ─────────────────────────────────────────────────
info "Seeding database..."
DATABASE_URL="postgresql://celebbase:devpw@localhost:5432/celebbase_dev" \
  pnpm db:seed

# ── Verify ────────────────────────────────────────────────────
info "Verifying seed data..."
COUNTS=$(docker exec celebbase_ws-postgres-1 psql -U celebbase -d celebbase_dev -t -A -c "
  SELECT 'celebrities=' || count(*) FROM celebrities
  UNION ALL SELECT 'recipes=' || count(*) FROM recipes
  UNION ALL SELECT 'ingredients=' || count(*) FROM ingredients;
")
echo "$COUNTS" | while read -r line; do ok "  $line"; done

ok "Dev environment ready!"
echo ""
info "Next steps:"
echo "  pnpm dev          # start all services"
echo "  pnpm test         # run tests"
echo "  pnpm db:migrate   # apply new migrations"
