#!/usr/bin/env bash
# scripts/e2e/journey.sh — full user-journey E2E against the local BFF.
#
# Drives the exact endpoints the mobile app calls (BFF -> BE -> DB) and asserts.
# Continues past failures to surface ALL breaks in one run, prints a summary.
# Single full-stack owner mode: this is the contract regression net.
#
# Usage:  E2E_BFF=http://localhost:3100 bash scripts/e2e/journey.sh
set -uo pipefail

BFF="${E2E_BFF:-http://localhost:3100}"
PASS=0
FAIL=0
FAILED_STEPS=()

# req METHOD PATH [BODY] [BEARER] -> prints "<body>\n<status>"
req() {
  local method="$1" path="$2" body="${3:-}" bearer="${4:-}"
  local args=(-s -w $'\n%{http_code}' -X "$method" "$BFF$path" -H 'Content-Type: application/json')
  [ -n "$bearer" ] && args+=(-H "Authorization: Bearer $bearer")
  [ -n "$body" ] && args+=(-d "$body")
  curl "${args[@]}" 2>/dev/null
}
status_of() { printf '%s' "$1" | tail -1; }
body_of() { printf '%s' "$1" | sed '$d'; }

jget() { python3 -c "import sys,json
try:
    d=json.load(sys.stdin); v=d$1
    print(v if v is not None else '')
except Exception:
    print('')" 2>/dev/null; }

# check NAME EXPECTED_CSV OUT
check() {
  local name="$1" exp="$2" out="$3"
  local act body
  act="$(status_of "$out")"
  body="$(body_of "$out")"
  if printf '%s' "$exp" | tr ',' '\n' | grep -qx "$act"; then
    printf '  \033[32mPASS\033[0m %s (%s)\n' "$name" "$act"
    PASS=$((PASS + 1))
  else
    printf '  \033[31mFAIL\033[0m %s (got %s, want %s)\n' "$name" "$act" "$exp"
    printf '       body: %s\n' "$(printf '%s' "$body" | head -c 240)"
    FAIL=$((FAIL + 1))
    FAILED_STEPS+=("$name [$act]")
  fi
}

EMAIL="e2e-$(date +%s)-$RANDOM@celebbase.local"
echo "=== E2E journey @ $BFF (user=$EMAIL) ==="

# ── 1. Auth ──────────────────────────────────────────────────────────────────
echo "[1] auth"
OUT="$(req POST /api/auth/mobile/signup "{\"email\":\"$EMAIL\",\"display_name\":\"E2E\"}")"
check "POST /auth/mobile/signup" "200,201" "$OUT"
AT="$(body_of "$OUT" | jget "['access_token']")"
USER_ID="$(body_of "$OUT" | jget "['user']['id']")"

OUT="$(req POST /api/auth/mobile/login "{\"email\":\"$EMAIL\"}")"
check "POST /auth/mobile/login" "200" "$OUT"

# ── 2. Profile / onboarding ──────────────────────────────────────────────────
echo "[2] profile + bio-profile (onboarding)"
OUT="$(req GET /api/users/me "" "$AT")"
check "GET /users/me" "200" "$OUT"

OUT="$(req GET /api/users/me/bio-profile "" "$AT")"
check "GET /users/me/bio-profile (pre)" "200,404" "$OUT"

BIO='{"birth_year":1994,"sex":"female","height_cm":165,"weight_kg":60,"activity_level":"moderate","primary_goal":"maintenance"}'
OUT="$(req POST /api/users/me/bio-profile "$BIO" "$AT")"
check "POST /users/me/bio-profile" "200,201" "$OUT"

OUT="$(req GET /api/users/me/bio-profile "" "$AT")"
check "GET /users/me/bio-profile (post)" "200" "$OUT"

# ── 3. Content discovery ─────────────────────────────────────────────────────
echo "[3] content discovery"
OUT="$(req GET /api/celebrities "" "$AT")"
check "GET /celebrities" "200" "$OUT"
SLUG="$(body_of "$OUT" | jget "['items'][0]['slug']")"
echo "       first slug: ${SLUG:-<none>}"

DIET_ID=""
if [ -n "$SLUG" ]; then
  OUT="$(req GET "/api/celebrities/$SLUG" "" "$AT")"
  check "GET /celebrities/$SLUG" "200" "$OUT"
  OUT="$(req GET "/api/celebrities/$SLUG/diets" "" "$AT")"
  check "GET /celebrities/$SLUG/diets" "200" "$OUT"
  DIET_ID="$(body_of "$OUT" | jget "['diets'][0]['id']")"
  echo "       first diet id: ${DIET_ID:-<none>}"
  OUT="$(req GET "/api/celebrities/$SLUG/claims" "" "$AT")"
  check "GET /celebrities/$SLUG/claims" "200" "$OUT"
fi

OUT="$(req GET /api/claims/feed "" "$AT")"
check "GET /claims/feed" "200" "$OUT"

# ── 4. Meal plan ─────────────────────────────────────────────────────────────
echo "[4] meal plan"
GEN="{\"base_diet_id\":\"${DIET_ID:-}\",\"duration_days\":3}"
OUT="$(req POST /api/meal-plans "$GEN" "$AT")"
check "POST /meal-plans (generate)" "200,201,202" "$OUT"
MP_ID="$(body_of "$OUT" | jget "['id']")"
[ -z "$MP_ID" ] && MP_ID="$(body_of "$OUT" | jget "['meal_plan']['id']")"
echo "       meal_plan id: ${MP_ID:-<none>}"
if [ -n "$MP_ID" ]; then
  OUT="$(req GET "/api/meal-plans/$MP_ID" "" "$AT")"
  check "GET /meal-plans/$MP_ID" "200" "$OUT"
  OUT="$(req GET "/api/meal-plans/$MP_ID/safety" "" "$AT")"
  check "GET /meal-plans/$MP_ID/safety" "200" "$OUT"
fi

# ── 5. Daily log ─────────────────────────────────────────────────────────────
echo "[5] daily log"
TODAY="$(date -u +%Y-%m-%d)"
DLOG="{\"log_date\":\"$TODAY\",\"weight_kg\":60,\"mood\":4}"
OUT="$(req POST /api/daily-logs "$DLOG" "$AT")"
check "POST /daily-logs" "200,201" "$OUT"
OUT="$(req GET "/api/daily-logs?start_date=$TODAY&end_date=$TODAY" "" "$AT")"
check "GET /daily-logs" "200" "$OUT"
OUT="$(req GET "/api/daily-logs/summary?range=7d" "" "$AT")"
check "GET /daily-logs/summary" "200" "$OUT"

# ── 6. Subscription ──────────────────────────────────────────────────────────
echo "[6] subscription"
OUT="$(req GET /api/subscriptions/me "" "$AT")"
check "GET /subscriptions/me" "200" "$OUT"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "=== SUMMARY: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  printf '  failed: %s\n' "${FAILED_STEPS[*]}"
  exit 1
fi
