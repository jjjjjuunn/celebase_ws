#!/usr/bin/env bash
# seed-demo-all.sh — orchestrate service-owned demo seed scripts.
#
# Service boundary enforcement (plan A11):
#   - services/user-service/scripts/seed-demo-user.ts writes only to user-service tables.
#   - services/meal-plan-engine/scripts/seed-demo-plan.py writes only to meal_plans.
#   - This script is the ONLY sanctioned path to run both together. apps/web
#     E2E must invoke this shell script instead of performing multi-service
#     DB writes directly.
#
# Idempotent: safe to run repeatedly.
# Prerequisite: `docker-compose up -d` + `pnpm --filter @celebbase/db seed`
# to have base_diets loaded.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

USER_SCRIPT="services/user-service/scripts/seed-demo-user.ts"
PLAN_SCRIPT="services/meal-plan-engine/scripts/seed-demo-plan.py"
PLAN_VENV="services/meal-plan-engine/.venv"

if [ ! -f "$USER_SCRIPT" ]; then
  echo "[seed-demo-all] missing $USER_SCRIPT" >&2
  exit 1
fi
if [ ! -f "$PLAN_SCRIPT" ]; then
  echo "[seed-demo-all] missing $PLAN_SCRIPT" >&2
  exit 1
fi

# Select Python interpreter: prefer service venv if asyncpg is installed,
# else fall back to system python3 (and verify asyncpg importable).
PY_BIN="${PY_BIN:-}"
if [ -z "$PY_BIN" ]; then
  if [ -x "$PLAN_VENV/bin/python" ] && "$PLAN_VENV/bin/python" -c "import asyncpg" >/dev/null 2>&1; then
    PY_BIN="$PLAN_VENV/bin/python"
  elif command -v python3 >/dev/null 2>&1 && python3 -c "import asyncpg" >/dev/null 2>&1; then
    PY_BIN="python3"
  else
    echo "[seed-demo-all] asyncpg not available in venv ($PLAN_VENV) or system python3." >&2
    echo "[seed-demo-all] Bootstrap with: python3 -m venv $PLAN_VENV && $PLAN_VENV/bin/pip install -r services/meal-plan-engine/requirements.txt" >&2
    exit 1
  fi
fi

echo "[seed-demo-all] step 1/2 — seeding demo user + premium subscription"
USER_OUTPUT="$(pnpm --filter @celebbase/user-service exec tsx scripts/seed-demo-user.ts)"

DEMO_USER_ID="$(printf '%s\n' "$USER_OUTPUT" | awk -F= '/^USER_ID=/ {print $2; exit}')"
if [ -z "${DEMO_USER_ID:-}" ]; then
  echo "[seed-demo-all] could not parse USER_ID from seed-demo-user.ts output" >&2
  echo "[seed-demo-all] raw output: $USER_OUTPUT" >&2
  exit 1
fi
echo "[seed-demo-all] DEMO_USER_ID=$DEMO_USER_ID"

echo "[seed-demo-all] step 2/2 — seeding demo 7-day completed meal plan (python: $PY_BIN)"
DEMO_USER_ID="$DEMO_USER_ID" "$PY_BIN" "$REPO_ROOT/$PLAN_SCRIPT"

echo "[seed-demo-all] done."
