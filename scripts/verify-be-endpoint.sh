#!/usr/bin/env bash
# verify-be-endpoint.sh — probe a live BE endpoint and assert it is reachable
# with the candidate request shape before FE writes BFF code against it.
#
# Usage:
#   scripts/verify-be-endpoint.sh <SERVICE> <METHOD> <PATH> [--body JSON] [--expect STATUS]
#
#   SERVICE : user | content | meal-plan
#   METHOD  : GET | POST | PATCH | PUT | DELETE
#   PATH    : path beginning with '/' (e.g. /meal-plans/<uuid>)
#
# Options:
#   --body JSON       Send JSON body with Content-Type: application/json.
#                     Required for PATCH / POST shape probes (plan D26).
#   --expect STATUS   Comma-separated list of acceptable HTTP codes.
#                     Defaults: GET → 200,401,404  POST → 200,201,400,401,422
#                               PATCH → 200,204,400,401,404,422
#                               DELETE → 200,202,204,401,404
#   --timeout N       Request timeout in seconds (default 5).
#
# Exit codes:
#   0  endpoint reachable AND status ∈ expected set.
#   1  reachable but status outside expected set OR missing required body.
#   2  network failure / connection refused (BE likely not booted).
#   3  usage error.
#
# Examples:
#   scripts/verify-be-endpoint.sh meal-plan PATCH /meal-plans/00000000-0000-7000-8000-000000000000 \
#     --body '{"status":"active"}' --expect 200,204,401,404,422
#   scripts/verify-be-endpoint.sh user POST /auth/login \
#     --body '{"email":"x@invalid","id_token":"fake"}' --expect 400,401,422
#
# This gate is ADVISORY (requires a booted BE stack). Per plan D26 it is
# invoked manually before each new BFF chunk and before D30 PATCH shape
# probes (A7) to close request-shape ambiguity.

set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "usage: $(basename "$0") <SERVICE> <METHOD> <PATH> [--body JSON] [--expect STATUS] [--timeout N]" >&2
  exit 3
fi

SERVICE="$1"
METHOD="$2"
REQ_PATH="$3"
shift 3

BODY=""
EXPECT=""
TIMEOUT=5

while [[ $# -gt 0 ]]; do
  case "$1" in
    --body)
      BODY="${2:-}"
      shift 2
      ;;
    --expect)
      EXPECT="${2:-}"
      shift 2
      ;;
    --timeout)
      TIMEOUT="${2:-5}"
      shift 2
      ;;
    *)
      echo "unknown flag: $1" >&2
      exit 3
      ;;
  esac
done

case "${SERVICE}" in
  user)
    BASE="${USER_SERVICE_URL:-http://localhost:3001}"
    ;;
  content)
    BASE="${CONTENT_SERVICE_URL:-http://localhost:3002}"
    ;;
  meal-plan)
    BASE="${MEAL_PLAN_URL:-http://localhost:3003}"
    ;;
  *)
    echo "unknown service: ${SERVICE} (expected: user | content | meal-plan)" >&2
    exit 3
    ;;
esac

case "${METHOD}" in
  GET|POST|PATCH|PUT|DELETE) ;;
  *)
    echo "unknown method: ${METHOD}" >&2
    exit 3
    ;;
esac

if [[ "${REQ_PATH}" != /* ]]; then
  echo "path must start with /: ${REQ_PATH}" >&2
  exit 3
fi

# Body required for PATCH / POST when probing request-shape compatibility.
if [[ "${METHOD}" == "PATCH" || "${METHOD}" == "POST" ]]; then
  if [[ -z "${BODY}" ]]; then
    echo "WARN: ${METHOD} without --body probes shape-only; BE may reject for missing body." >&2
  fi
fi

if [[ -z "${EXPECT}" ]]; then
  case "${METHOD}" in
    GET)    EXPECT="200,401,404" ;;
    POST)   EXPECT="200,201,400,401,422" ;;
    PATCH)  EXPECT="200,204,400,401,404,422" ;;
    PUT)    EXPECT="200,204,400,401,404,422" ;;
    DELETE) EXPECT="200,202,204,401,404" ;;
  esac
fi

URL="${BASE}${REQ_PATH}"

args=(
  --silent
  --show-error
  --output /dev/null
  --write-out '%{http_code}'
  --max-time "${TIMEOUT}"
  --request "${METHOD}"
)
if [[ -n "${BODY}" ]]; then
  args+=(--header 'Content-Type: application/json' --data "${BODY}")
fi
if [[ -n "${TEST_USER_JWT:-}" ]]; then
  args+=(--header "Authorization: Bearer ${TEST_USER_JWT}")
fi

STATUS=$(curl "${args[@]}" "${URL}" 2>/dev/null) || STATUS="000"

# curl may emit the write-out value even on failure; strip to first 3 digits.
STATUS="${STATUS:0:3}"

if [[ "${STATUS}" == "000" ]]; then
  echo "NETWORK FAIL ${METHOD} ${URL} — BE unreachable (is the service booted?)" >&2
  exit 2
fi

# Split expected CSV and check membership.
IFS=',' read -r -a expect_arr <<< "${EXPECT}"
for code in "${expect_arr[@]}"; do
  if [[ "${STATUS}" == "${code}" ]]; then
    echo "OK   ${METHOD} ${URL} → ${STATUS} (in {${EXPECT}})"
    exit 0
  fi
done

echo "FAIL ${METHOD} ${URL} → ${STATUS} (expected one of {${EXPECT}})" >&2
exit 1
