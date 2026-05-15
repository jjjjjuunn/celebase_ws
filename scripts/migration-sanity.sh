#!/usr/bin/env bash
#
# migration-sanity.sh — verify critical columns exist post-migration.
# CHORE-STAGING-MIGRATION-PIPELINE-001.
#
# Called by .github/workflows/cd.yml deploy step after `docker compose run --rm
# db-migrate` to catch drift between db/migrations/ on main and the staging DB.
#
# Coverage tier: "smoke" — column existence only. NOT type/nullable/constraint.
# Destructive migration safety is handled by Migration Classification Policy
# (additive vs destructive) — see docs/runbooks/MIGRATION-ROLLBACK.md.
#
# Usage:
#   bash scripts/migration-sanity.sh
#
# Env vars (all optional with safe defaults):
#   MIGRATION_DB_SERVICE — docker compose service name (default: postgres)
#   PGUSER               — DB user (default: celebbase)
#   PGDATABASE           — DB name (default: celebase)

set -euo pipefail

DB_SERVICE="${MIGRATION_DB_SERVICE:-postgres}"

# Critical columns — representative entries across major migrations.
# Coverage is intentionally narrow ("smoke tier") — add an entry when a new
# migration adds a critical column. Destructive change detection is policy
# enforcement, not part of this script (see migration class header convention).
#
# Format: "table:column:source_migration_filename"
CRITICAL_COLUMNS=(
  "users:preferred_celebrity_slug:0010_users-preferred-celebrity.sql"
  "users:preferences:0012_users_preferences.sql"
  "refresh_tokens:jti:0007_refresh-tokens.sql"
  "subscriptions:stripe_customer_id:0005_subscription-stripe-index.sql"
  "lifestyle_claims:id:0014_lifestyle_claims.sql"
)

# ─────────────────────────────────────────────────────────────────────────────
# Retry loop — fresh staging boot or host restart can race the db container
# health probe. 10 attempts × 5s = 50s budget before failing.
# ─────────────────────────────────────────────────────────────────────────────
DB_CID=""
for i in $(seq 1 10); do
  DB_CID="$(docker compose ps -q "${DB_SERVICE}" 2>/dev/null || true)"
  if [ -n "${DB_CID}" ]; then
    DB_HEALTH="$(docker inspect "${DB_CID}" \
      --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
      2>/dev/null || echo "unknown")"
    if [ "${DB_HEALTH}" = "healthy" ]; then
      break
    fi
  fi
  if [ "$i" -eq 10 ]; then
    echo "❌ db service '${DB_SERVICE}' not healthy after 10 retries (50s)"
    echo "   Investigate: docker compose ps + docker compose logs ${DB_SERVICE}"
    exit 1
  fi
  echo "[sanity] db not ready (try ${i}/10), waiting 5s..."
  sleep 5
done

# ─────────────────────────────────────────────────────────────────────────────
# Critical column existence check.
# Credentials sourced from env (PGUSER / PGDATABASE) — no hardcoded -U flag.
# ─────────────────────────────────────────────────────────────────────────────
PGUSER_VAL="${PGUSER:-celebbase}"
PGDATABASE_VAL="${PGDATABASE:-celebase}"

missing=()
for entry in "${CRITICAL_COLUMNS[@]}"; do
  IFS=':' read -r table column source_file <<<"${entry}"
  exists="$(docker exec \
    -e PGUSER="${PGUSER_VAL}" \
    -e PGDATABASE="${PGDATABASE_VAL}" \
    "${DB_CID}" \
    psql -tAc \
    "SELECT 1 FROM information_schema.columns WHERE table_name='${table}' AND column_name='${column}'" \
    2>/dev/null || echo "")"
  if [ -z "${exists}" ]; then
    missing+=("${table}.${column} (from ${source_file})")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "❌ migration sanity FAILED — critical columns missing:"
  printf '   - %s\n' "${missing[@]}"
  echo
  echo "Likely cause: db-migrate did not apply expected migration."
  echo "Investigate: docker compose logs db-migrate"
  echo "             docker compose exec ${DB_SERVICE} psql -U ${PGUSER_VAL} -d ${PGDATABASE_VAL} -c 'SELECT name FROM pgmigrations ORDER BY name'"
  exit 1
fi

echo "✅ migration sanity OK (${#CRITICAL_COLUMNS[@]} critical columns verified, smoke tier)"
