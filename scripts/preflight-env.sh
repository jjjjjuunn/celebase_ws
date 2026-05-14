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
  # Trim trailing whitespace, skip blanks + comments.
  key="$(echo "${line}" | sed -E 's/[[:space:]]+$//; s/^[[:space:]]+//')"
  [ -z "${key}" ] && continue
  [[ "${key}" =~ ^# ]] && continue

  # Manifest key must be valid env var name — guards against regex metachar
  # injection and matches POSIX env var naming convention.
  if ! [[ "${key}" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
    echo "❌ invalid manifest key (expect ^[A-Z_][A-Z0-9_]*\$): ${key}"
    exit 1
  fi

  # First match only — duplicate keys in .env.staging are operator error,
  # docker compose uses the last definition; we surface presence not order.
  match="$(grep -E "^${key}=" "${ACTUAL}" 2>/dev/null | head -1 || true)"
  if [ -z "${match}" ]; then
    missing+=("${key}")
  else
    # Strip leading KEY= and trim whitespace before/after value.
    value="${match#${key}=}"
    trimmed="$(echo "${value}" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    # Also reject quoted-empty values: "", ''
    if [ -z "${trimmed}" ] || [ "${trimmed}" = '""' ] || [ "${trimmed}" = "''" ]; then
      empty+=("${key}")
    fi
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

# Identify user-service container by ID (not text grep — robust across compose
# output format changes).
USER_CID="$(docker compose ps -q user-service 2>/dev/null || true)"
if [ -z "${USER_CID}" ]; then
  echo "ℹ️  user-service container not present — skipping JWT equality check"
  exit 0
fi

# Inspect actual health status (not text scrape).
USER_HEALTH="$(docker inspect "${USER_CID}" \
  --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
  2>/dev/null || echo "unknown")"

case "${USER_HEALTH}" in
  healthy)
    : # proceed to JWT compare
    ;;
  starting|none|unknown|"")
    echo "⚠️  user-service health=${USER_HEALTH:-unknown} — skipping JWT check"
    echo "   (re-run preflight after user-service reaches healthy state)"
    exit 0
    ;;
  unhealthy|*)
    # Refuse to proceed when user-service is unhealthy — we cannot verify
    # JWT secret parity and Bearer flow would fail anyway.
    echo "❌ user-service unhealthy (${USER_HEALTH}) — refusing to deploy"
    echo "   Inspect: docker compose logs user-service --tail 50"
    exit 1
    ;;
esac

WEB_HASH="$(grep -E '^INTERNAL_JWT_SECRET=' "${ACTUAL}" | head -1 | cut -d= -f2- | sha256sum | cut -d' ' -f1)"

# Hash inside container so raw secret never leaves the container's stdout.
# Capture both output and exit status to distinguish exec failure from empty secret.
USER_EXEC_OUT="$(docker exec "${USER_CID}" sh -c \
  'printenv INTERNAL_JWT_SECRET 2>/dev/null | sha256sum' 2>&1)"
USER_EXEC_STATUS=$?

if [ "${USER_EXEC_STATUS}" -ne 0 ]; then
  echo "❌ docker exec failed against user-service (status ${USER_EXEC_STATUS})"
  echo "   stderr: ${USER_EXEC_OUT:0:200}"
  exit 1
fi

USER_HASH="$(echo "${USER_EXEC_OUT}" | cut -d' ' -f1)"
EMPTY_SHA="$(echo -n '' | sha256sum | cut -d' ' -f1)"

if [ ${#USER_HASH} -ne 64 ]; then
  echo "❌ unexpected sha256 output from user-service exec: '${USER_HASH:0:80}'"
  exit 1
fi

if [ "${USER_HASH}" = "${EMPTY_SHA}" ]; then
  echo "❌ user-service INTERNAL_JWT_SECRET is empty — verify its .env.staging"
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
