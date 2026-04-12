#!/usr/bin/env bash
# gate-check.sh — 파이프라인 게이트의 자동 체크를 실행하고 JSON 결과를 출력한다.
#
# Usage:
#   scripts/gate-check.sh <check> [--cd <worktree-path>]
#   scripts/gate-check.sh all [--cd <worktree-path>] [--output <json-path>]
#
# Checks: typecheck, lint, test, policy, secrets, all

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments
CHECK="${1:-all}"
shift || true

WORK_DIR="$PROJECT_ROOT"
OUTPUT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cd)
      WORK_DIR="$2"
      shift 2
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Timestamp
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Result accumulator
RESULTS=()
OVERALL_PASS=true

run_check() {
  local name="$1"
  local cmd="$2"
  local exit_code=0
  local output=""

  output=$(cd "$WORK_DIR" && eval "$cmd" 2>&1) || exit_code=$?

  local passed="true"
  if [[ $exit_code -ne 0 ]]; then
    passed="false"
    OVERALL_PASS=false
  fi

  # Truncate output to last 50 lines for JSON
  local truncated
  truncated=$(echo "$output" | tail -50 | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')

  RESULTS+=("{\"name\":\"$name\",\"passed\":$passed,\"exit_code\":$exit_code,\"output\":\"$truncated\"}")
}

# Policy check: scan for deny patterns in changed files
check_policy() {
  local exit_code=0
  local issues=""

  cd "$WORK_DIR"

  # Get changed files (compared to main)
  local changed_files
  changed_files=$(git diff --name-only main...HEAD -- '*.ts' '*.tsx' '*.py' '*.sql' '*.sh' 2>/dev/null || git diff --name-only HEAD~1 -- '*.ts' '*.tsx' '*.py' '*.sql' '*.sh' 2>/dev/null || echo "")

  if [[ -z "$changed_files" ]]; then
    echo '{"name":"policy","passed":true,"exit_code":0,"output":"No changed files to check"}'
    return
  fi

  # Deny patterns from harness/policy.yaml
  local deny_patterns=(
    "--no-verify"
    "rm -rf"
    "git push --force"
    "git reset --hard"
    "DROP TABLE"
    "TRUNCATE"
    "gen_random_uuid()"
    "console.log"
  )

  for pattern in "${deny_patterns[@]}"; do
    local matches
    matches=$(echo "$changed_files" | xargs grep -l "$pattern" 2>/dev/null || true)
    if [[ -n "$matches" ]]; then
      issues+="DENY pattern '$pattern' found in: $matches\n"
      exit_code=1
    fi
  done

  local passed="true"
  if [[ $exit_code -ne 0 ]]; then
    passed="false"
    OVERALL_PASS=false
  fi

  local truncated
  truncated=$(echo -e "$issues" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')

  RESULTS+=("{\"name\":\"policy\",\"passed\":$passed,\"exit_code\":$exit_code,\"output\":\"$truncated\"}")
}

# Secret scan: check for hardcoded secrets in changed files
check_secrets() {
  local exit_code=0
  local issues=""

  cd "$WORK_DIR"

  local changed_files
  changed_files=$(git diff --name-only main...HEAD -- '*.ts' '*.tsx' '*.py' '*.sql' '*.sh' '*.json' 2>/dev/null || git diff --name-only HEAD~1 -- '*.ts' '*.tsx' '*.py' '*.sql' '*.sh' '*.json' 2>/dev/null || echo "")

  if [[ -z "$changed_files" ]]; then
    echo '{"name":"secrets","passed":true,"exit_code":0,"output":"No changed files to check"}'
    return
  fi

  # Secret patterns from harness/policy.yaml
  local secret_patterns=(
    'AKIA[0-9A-Z]\{16\}'
    'ghp_[a-zA-Z0-9]\{36\}'
    'sk-[a-zA-Z0-9]\{48\}'
    'sk_live_[a-zA-Z0-9]\{24,\}'
    'sk_test_[a-zA-Z0-9]\{24,\}'
    'xoxb-[0-9]\{10,\}'
    'xoxp-[0-9]\{10,\}'
  )

  for pattern in "${secret_patterns[@]}"; do
    local matches
    matches=$(echo "$changed_files" | xargs grep -lE "$pattern" 2>/dev/null || true)
    if [[ -n "$matches" ]]; then
      issues+="SECRET pattern found in: $matches\n"
      exit_code=1
    fi
  done

  local passed="true"
  if [[ $exit_code -ne 0 ]]; then
    passed="false"
    OVERALL_PASS=false
  fi

  local truncated
  truncated=$(echo -e "$issues" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')

  RESULTS+=("{\"name\":\"secrets\",\"passed\":$passed,\"exit_code\":$exit_code,\"output\":\"$truncated\"}")
}

# Run requested checks
case "$CHECK" in
  typecheck)
    run_check "typecheck" "pnpm turbo run typecheck"
    ;;
  lint)
    run_check "lint" "pnpm turbo run lint"
    ;;
  test)
    run_check "test" "pnpm turbo run test"
    ;;
  policy)
    check_policy
    ;;
  secrets)
    check_secrets
    ;;
  build)
    run_check "build" "pnpm turbo run build --force"
    ;;
  all)
    run_check "typecheck" "pnpm turbo run typecheck --force"
    run_check "lint" "pnpm turbo run lint --force"
    run_check "build" "pnpm turbo run build --force"
    run_check "test" "pnpm turbo run test --force"
    check_policy
    check_secrets
    ;;
  *)
    echo "Unknown check: $CHECK" >&2
    echo "Available: typecheck, lint, test, policy, secrets, all" >&2
    exit 1
    ;;
esac

# Build JSON output
CHECKS_JSON=$(IFS=,; echo "${RESULTS[*]}")
STATUS="pass"
if [[ "$OVERALL_PASS" == "false" ]]; then
  STATUS="fail"
fi

JSON_OUTPUT="{\"status\":\"$STATUS\",\"timestamp\":\"$TIMESTAMP\",\"checks\":[$CHECKS_JSON]}"

if [[ -n "$OUTPUT_FILE" ]]; then
  echo "$JSON_OUTPUT" > "$OUTPUT_FILE"
  echo "Gate check result written to: $OUTPUT_FILE" >&2
fi

echo "$JSON_OUTPUT"

if [[ "$STATUS" == "fail" ]]; then
  exit 1
fi
