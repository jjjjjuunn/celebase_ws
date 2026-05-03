#!/usr/bin/env bash
# record-fixtures.sh — capture live BE responses as FE contract fixtures.
#
# Usage:
#   apps/web/scripts/record-fixtures.sh
#
# Prereqs (checked below):
#   • user-service        USER_SERVICE_URL        (default http://localhost:3001)
#   • content-service     CONTENT_SERVICE_URL     (default http://localhost:3002)
#   • meal-plan-engine    MEAL_PLAN_URL           (default http://localhost:3003)
#   • jq installed
#   • TEST_USER_JWT       an internal HS256 token for a seeded test user
#     (record a fresh one with `scripts/mint-test-jwt.sh` or exchange via
#      Cognito Hosted UI dev flow — see docs/runbooks).
#
# Outputs 8 JSON files under apps/web/scripts/fixtures/:
#   auth.json, users.json, bio-profiles.json, celebrities.json,
#   base-diets.json, recipes.json, meal-plans.json, ws-ticket.json
#
# Hand-editing the generated files is FORBIDDEN (plan D25). Re-run this
# recorder when the BE contract changes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="${SCRIPT_DIR}/fixtures"
mkdir -p "${FIXTURE_DIR}"

USER_SERVICE_URL="${USER_SERVICE_URL:-http://localhost:3001}"
CONTENT_SERVICE_URL="${CONTENT_SERVICE_URL:-http://localhost:3002}"
MEAL_PLAN_URL="${MEAL_PLAN_URL:-http://localhost:3003}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed. Install via 'brew install jq'." >&2
  exit 1
fi

if [[ -z "${TEST_USER_JWT:-}" ]]; then
  echo "ERROR: TEST_USER_JWT is unset. Export a valid internal HS256 token before running." >&2
  echo "       (Mint one via the dev auth flow or the user-service debug-jwt endpoint.)" >&2
  exit 1
fi

if [[ -z "${TEST_USER_ID_TOKEN:-}" ]]; then
  echo "ERROR: TEST_USER_ID_TOKEN is unset. /auth/login requires a valid Cognito id_token." >&2
  exit 1
fi

if [[ -z "${TEST_USER_EMAIL:-}" ]]; then
  echo "ERROR: TEST_USER_EMAIL is unset." >&2
  exit 1
fi

fail_count=0
record() {
  local label="$1"
  local file="$2"
  local url="$3"
  local method="${4:-GET}"
  local body="${5:-}"
  local auth="${6:-none}"  # 'bearer' | 'none'

  local args=(--silent --show-error --fail-with-body --request "${method}")
  if [[ "${auth}" == "bearer" ]]; then
    args+=(--header "Authorization: Bearer ${TEST_USER_JWT}")
  fi
  if [[ -n "${body}" ]]; then
    args+=(--header 'Content-Type: application/json' --data "${body}")
  fi

  echo "  [${label}] ${method} ${url}"
  if ! curl "${args[@]}" "${url}" | jq '.' > "${FIXTURE_DIR}/${file}"; then
    echo "    FAIL: ${label} ${method} ${url}" >&2
    fail_count=$((fail_count + 1))
    return 1
  fi
  local bytes
  bytes=$(wc -c < "${FIXTURE_DIR}/${file}" | tr -d ' ')
  echo "    wrote ${file} (${bytes} bytes)"
}

echo "Recording FE contract fixtures against live BE dev stack..."
echo "  user-service:    ${USER_SERVICE_URL}"
echo "  content-service: ${CONTENT_SERVICE_URL}"
echo "  meal-plan-engine: ${MEAL_PLAN_URL}"
echo ""

# user-service
record auth auth.json \
  "${USER_SERVICE_URL}/auth/login" \
  POST \
  "$(jq -c -n --arg email "${TEST_USER_EMAIL}" --arg id_token "${TEST_USER_ID_TOKEN}" '{email: $email, id_token: $id_token}')" \
  none || true

record users users.json \
  "${USER_SERVICE_URL}/users/me" \
  GET '' bearer || true

record bio-profiles bio-profiles.json \
  "${USER_SERVICE_URL}/users/me/bio-profile" \
  GET '' bearer || true

# content-service
record celebrities celebrities.json \
  "${CONTENT_SERVICE_URL}/celebrities?limit=20" \
  GET '' none || true

# base-diets requires a real id; pull the first celebrity's first diet
first_diet_id=$(jq -r '.items[0].id // empty' "${FIXTURE_DIR}/celebrities.json" 2>/dev/null || true)
if [[ -n "${first_diet_id}" ]]; then
  # Most BE wires base-diet fetch via /base-diets/:id keyed off a diet id; if
  # your setup differs, override DIET_ID in env.
  dietId="${DIET_ID:-${first_diet_id}}"
else
  dietId="${DIET_ID:-}"
fi
if [[ -z "${dietId}" ]]; then
  echo "  [base-diets] SKIP: DIET_ID not set and no diet id found in celebrities.json" >&2
  fail_count=$((fail_count + 1))
else
  record base-diets base-diets.json \
    "${CONTENT_SERVICE_URL}/base-diets/${dietId}" \
    GET '' none || true
fi

record recipes recipes.json \
  "${CONTENT_SERVICE_URL}/recipes?limit=20" \
  GET '' none || true

# meal-plan-engine
record meal-plans meal-plans.json \
  "${MEAL_PLAN_URL}/meal-plans?limit=20" \
  GET '' bearer || true

record ws-ticket ws-ticket.json \
  "${MEAL_PLAN_URL}/ws/ticket" \
  POST '{}' bearer || true

echo ""
if [[ ${fail_count} -gt 0 ]]; then
  echo "record-fixtures: ${fail_count} failure(s). Fix BE stack / env and re-run." >&2
  exit 1
fi
echo "record-fixtures: all 8 fixtures captured under ${FIXTURE_DIR}/"
echo "Next: commit the JSON files and re-run \`scripts/gate-check.sh fe_contract_check\`."
