#!/usr/bin/env bash
#
# preflight-env.sh — verify staging env file is complete + cross-service consistent
# before docker compose pull/up. Called by CD deploy step and manually after
# EC2 .env.staging edits.
#
# CHORE-MOBILE-STAGING-BFF-001 Phase C.
#
# Usage:
#   bash scripts/preflight-env.sh <svc-dir>
#   e.g. bash scripts/preflight-env.sh apps/web
#
# Reads <svc-dir>/.env.staging.required (one key per line, # comments allowed)
# and verifies each key is present + non-empty in /app/.env.staging.
#
# Also performs cross-service equality check for INTERNAL_JWT_SECRET — must
# match the running user-service container's runtime env (SHA256 compared).
# Mismatch causes Bearer JWT validation to fail silently on every protected
# API call (web verifies JWTs signed by user-service with the same HS256 key).

set -euo pipefail

SVC_DIR="${1:?usage: preflight-env.sh <svc-dir>}"
REQUIRED_FILE="${SVC_DIR}/.env.staging.required"
ACTUAL="${PREFLIGHT_ENV_FILE:-/app/.env.staging}"

if [ ! -f "${REQUIRED_FILE}" ]; then
  echo "❌ required manifest missing: ${REQUIRED_FILE}"
  exit 1
fi

if [ ! -f "${ACTUAL}" ]; then
  echo "❌ env file missing: ${ACTUAL}"
  echo "   Copy ${SVC_DIR}/.env.staging.example → ${ACTUAL} and fill from"
  echo "   terraform outputs + Secrets Manager + staging domain."
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# 1. Required keys present + non-empty.
# ─────────────────────────────────────────────────────────────────────────────
missing=()
empty=()

while IFS= read -r line || [ -n "${line}" ]; do
  # Skip blank lines and comments.
  key="$(echo "${line}" | sed -E 's/[[:space:]]+$//')"
  [ -z "${key}" ] && continue
  [[ "${key}" =~ ^# ]] && continue

  # ${ACTUAL} format: KEY=value (POSIX shell env file).
  match="$(grep -E "^${key}=" "${ACTUAL}" || true)"
  if [ -z "${match}" ]; then
    missing+=("${key}")
  elif [ "${match}" = "${key}=" ]; then
    empty+=("${key}")
  fi
done < "${REQUIRED_FILE}"

if [ ${#missing[@]} -gt 0 ] || [ ${#empty[@]} -gt 0 ]; then
  echo "❌ preflight FAILED — ${ACTUAL} incomplete"
  if [ ${#missing[@]} -gt 0 ]; then
    echo "   missing keys (${#missing[@]}):"
    printf '     - %s\n' "${missing[@]}"
  fi
  if [ ${#empty[@]} -gt 0 ]; then
    echo "   empty keys (${#empty[@]}):"
    printf '     - %s\n' "${empty[@]}"
  fi
  echo
  echo "Fix: edit ${ACTUAL} on the host (gitignored) and re-run preflight."
  exit 1
fi

required_count=$(grep -cE '^[A-Z]' "${REQUIRED_FILE}" || true)
echo "✅ required keys present (${required_count})"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Cross-service INTERNAL_JWT_SECRET equality (SHA256-compared, no raw stdout).
#    Only applies when running on the staging host (docker compose context).
# ─────────────────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "ℹ️  docker absent — skipping cross-service JWT equality check"
  exit 0
fi

if ! docker compose ps user-service 2>/dev/null | grep -qE 'running|healthy'; then
  echo "⚠️  user-service not running — skipping JWT equality check (re-run after BE boot)"
  exit 0
fi

WEB_HASH="$(grep -E '^INTERNAL_JWT_SECRET=' "${ACTUAL}" | cut -d= -f2- | sha256sum | cut -d' ' -f1)"
# Hash inside container so raw secret never leaves the container's stdout.
USER_HASH="$(docker compose exec -T user-service sh -c \
  'printenv INTERNAL_JWT_SECRET 2>/dev/null | sha256sum' | cut -d' ' -f1 || echo "")"

if [ -z "${USER_HASH}" ] || [ "${USER_HASH}" = "$(echo -n '' | sha256sum | cut -d' ' -f1)" ]; then
  echo "⚠️  user-service has empty INTERNAL_JWT_SECRET — verify user-service .env.staging"
  exit 1
fi

if [ "${WEB_HASH}" != "${USER_HASH}" ]; then
  echo "❌ INTERNAL_JWT_SECRET mismatch between ${ACTUAL} (web) and user-service runtime"
  echo "   web    sha256[0:16]: ${WEB_HASH:0:16}..."
  echo "   user-svc sha256[0:16]: ${USER_HASH:0:16}..."
  echo
  echo "Bearer JWTs signed by user-service will fail verification at the BFF."
  echo "Fix: align both .env.staging files to the same secret (Secrets Manager source of truth)."
  exit 1
fi

echo "✅ INTERNAL_JWT_SECRET matches user-service runtime (sha256[0:8]: ${WEB_HASH:0:8})"
echo "✅ preflight OK"
