#!/usr/bin/env bash
# gate-check.sh — 파이프라인 게이트의 자동 체크를 실행하고 JSON 결과를 출력한다.
#
# Usage:
#   scripts/gate-check.sh <check> [--cd <worktree-path>]
#   scripts/gate-check.sh all [--cd <worktree-path>] [--output <json-path>]
#
# Checks: typecheck, lint, python_lint, test, policy, secrets, sql_schema,
#          service_boundary, phi_audit, migration_freshness, all

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

# PHI audit log verification: routes accessing PHI fields must call writePhiAuditLog
check_phi_audit() {
  local exit_code=0
  local issues=""

  cd "$WORK_DIR"

  # PHI field patterns that indicate bio_profile / health data access
  local phi_patterns="biomarkers|medical_conditions|medications|bio.profile"

  # Scan all route files across services
  local route_files
  route_files=$(find services -path '*/src/routes/*.ts' -o -path '*/src/routes/*.py' 2>/dev/null || true)

  if [[ -z "$route_files" ]]; then
    RESULTS+=('{"name":"phi_audit","passed":true,"exit_code":0,"output":"No route files found"}')
    return
  fi

  for route_file in $route_files; do
    # Check if this route file references PHI fields
    if grep -qE "$phi_patterns" "$route_file" 2>/dev/null; then
      # It references PHI — must also have audit log call
      if ! grep -qE "writePhiAuditLog|createPhiAuditHook" "$route_file" 2>/dev/null; then
        issues+="PHI ACCESS WITHOUT AUDIT LOG: $route_file references PHI fields but does not call writePhiAuditLog or createPhiAuditHook\n"
        exit_code=1
      fi
    fi
  done

  local passed="true"
  if [[ $exit_code -ne 0 ]]; then
    passed="false"
    OVERALL_PASS=false
  fi

  local truncated
  truncated=$(printf '%s' "$issues" | tail -20 | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr '\n' ' ')

  RESULTS+=("{\"name\":\"phi_audit\",\"passed\":$passed,\"exit_code\":$exit_code,\"output\":\"$truncated\"}")
}

# Migration freshness: warn if DB has unapplied migrations
check_migration_freshness() {
  local exit_code=0
  local issues=""

  cd "$WORK_DIR"

  local migrations_dir="$WORK_DIR/db/migrations"
  if [[ ! -d "$migrations_dir" ]]; then
    RESULTS+=('{"name":"migration_freshness","passed":true,"exit_code":0,"output":"No migrations directory"}')
    return
  fi

  # Count migration files
  local file_count
  file_count=$(ls "$migrations_dir"/*.sql 2>/dev/null | wc -l | tr -d ' ')

  # Try to query DB for applied migrations (skip if DB unavailable)
  local db_url="${DATABASE_URL:-postgresql://celebbase:devpw@localhost:5432/celebbase_dev}"

  local db_count
  db_count=$(psql "$db_url" -t -A -c "SELECT count(*) FROM pgmigrations;" 2>/dev/null || echo "SKIP")

  if [[ "$db_count" == "SKIP" ]]; then
    # DB not available via psql — try via docker
    db_count=$(docker exec celebbase_ws-postgres-1 psql -U celebbase -d celebbase_dev -t -A -c \
      "SELECT count(*) FROM pgmigrations;" 2>/dev/null || echo "SKIP")
  fi

  # pgmigrations table may not exist if migrations were applied manually
  if [[ "$db_count" == "" || "$db_count" == *"does not exist"* ]]; then
    db_count="SKIP"
  fi

  if [[ "$db_count" == "SKIP" ]]; then
    RESULTS+=('{"name":"migration_freshness","passed":true,"exit_code":0,"output":"DB not reachable — skipping migration freshness check"}')
    return
  fi

  if [[ "$file_count" -gt "$db_count" ]]; then
    local pending=$((file_count - db_count))
    issues="$pending unapplied migration(s): $file_count files on disk, $db_count applied in DB. Run: pnpm db:migrate"
    # Warning only — don't fail the gate (local dev environment)
    RESULTS+=("{\"name\":\"migration_freshness\",\"passed\":true,\"exit_code\":0,\"output\":\"WARN: $issues\"}")
    return
  fi

  RESULTS+=("{\"name\":\"migration_freshness\",\"passed\":true,\"exit_code\":0,\"output\":\"$file_count migrations applied ($db_count in DB)\"}")
}

# Fake pytest stub detection: Codex QA sometimes creates pytest/ directories
check_fake_stubs() {
  local exit_code=0
  local issues=""

  cd "$WORK_DIR"

  # Check for pytest/ directories outside node_modules (fake stubs)
  local fake_dirs
  fake_dirs=$(find . -path ./node_modules -prune -o -name "pytest" -type d -print 2>/dev/null | grep -v node_modules || true)

  if [[ -n "$fake_dirs" ]]; then
    issues="Fake pytest stub directories found: $fake_dirs"
    exit_code=1
  fi

  local passed="true"
  if [[ $exit_code -ne 0 ]]; then
    passed="false"
    OVERALL_PASS=false
  fi

  local truncated
  truncated=$(echo -e "$issues" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr '\n' ' ')

  RESULTS+=("{\"name\":\"fake_stubs\",\"passed\":$passed,\"exit_code\":$exit_code,\"output\":\"$truncated\"}")
}

# SQL-schema alignment: check that INSERT/UPDATE columns exist in migration DDL
check_sql_schema_alignment() {
  local exit_code=0
  local issues=""

  cd "$WORK_DIR"

  # Get changed .py and .ts files
  local changed_files
  changed_files=$(git diff --name-only main...HEAD -- '*.py' '*.ts' 2>/dev/null || git diff --name-only HEAD~1 -- '*.py' '*.ts' 2>/dev/null || echo "")

  if [[ -z "$changed_files" ]]; then
    RESULTS+=('{"name":"sql_schema_alignment","passed":true,"exit_code":0,"output":"No changed source files"}')
    return
  fi

  local migrations_dir="$WORK_DIR/db/migrations"
  if [[ ! -d "$migrations_dir" ]]; then
    RESULTS+=('{"name":"sql_schema_alignment","passed":true,"exit_code":0,"output":"No migrations directory"}')
    return
  fi

  # Extract INSERT INTO <table> (col1, col2, ...) from changed files
  # Uses perl for multiline matching (macOS grep lacks -P and multiline)
  local insert_matches
  insert_matches=$(echo "$changed_files" | xargs perl -0777 -ne 'while (/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/gi) { print "$1|$2\n"; }' 2>/dev/null || true)

  if [[ -z "$insert_matches" ]]; then
    RESULTS+=('{"name":"sql_schema_alignment","passed":true,"exit_code":0,"output":"No INSERT statements in changed files"}')
    return
  fi

  # Process each INSERT match (format: table|col1, col2, ...)
  while IFS= read -r match; do
    local table
    table=$(echo "$match" | cut -d'|' -f1)
    local cols_raw
    cols_raw=$(echo "$match" | cut -d'|' -f2-)

    # Parse column names (strip whitespace, type casts, quotes)
    local insert_cols=()
    IFS=',' read -ra col_parts <<< "$cols_raw"
    for c in "${col_parts[@]}"; do
      local col_name
      col_name=$(echo "$c" | sed -E 's/^[[:space:]]+//;s/[[:space:]]+$//;s/::[a-z]+//g;s/"//g')
      [[ -n "$col_name" ]] && insert_cols+=("$col_name")
    done

    # Find CREATE TABLE for this table in migrations (perl for precise block extraction)
    local ddl_cols=""
    ddl_cols=$(cat "$migrations_dir"/*.sql 2>/dev/null | \
      perl -0777 -ne "while (/CREATE TABLE ${table}\s*\((.+?)\);/gs) {
        my \$block = \$1;
        while (\$block =~ /^\s+([a-z_]+)\s/gm) { print \"\$1\n\"; }
      }" || true)

    # Also check ALTER TABLE ... ADD COLUMN (multiline-aware)
    local alter_cols
    alter_cols=$(cat "$migrations_dir"/*.sql 2>/dev/null | \
      perl -0777 -ne "while (/ALTER TABLE ${table}\s+ADD COLUMN\s+([a-z_]+)/gi) { print \"\$1\n\"; }" || true)

    if [[ -n "$alter_cols" ]]; then
      ddl_cols="$ddl_cols"$'\n'"$alter_cols"
    fi

    if [[ -z "$ddl_cols" ]]; then
      # Table not found in migrations — skip (might be from an external source)
      continue
    fi

    # Check each INSERT column exists in DDL
    for col in "${insert_cols[@]}"; do
      if ! echo "$ddl_cols" | grep -qw "$col"; then
        issues+="Column '${col}' in INSERT INTO ${table} not found in migration DDL\n"
        exit_code=1
      fi
    done
  done <<< "$insert_matches"

  local passed="true"
  if [[ $exit_code -ne 0 ]]; then
    passed="false"
    OVERALL_PASS=false
  fi

  local truncated
  truncated=$(printf '%s' "$issues" | tr '\n' ' ' | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')

  RESULTS+=("{\"name\":\"sql_schema_alignment\",\"passed\":$passed,\"exit_code\":$exit_code,\"output\":\"$truncated\"}")
}

# Python lint: run ruff on changed Python files
check_python_lint() {
  local exit_code=0
  local issues=""

  cd "$WORK_DIR"

  local changed_py
  changed_py=$(git diff --name-only main...HEAD -- '*.py' 2>/dev/null || git diff --name-only HEAD~1 -- '*.py' 2>/dev/null || echo "")

  if [[ -z "$changed_py" ]]; then
    RESULTS+=('{"name":"python_lint","passed":true,"exit_code":0,"output":"No changed Python files"}')
    return
  fi

  # Find ruff in any Python venv or PATH
  local ruff_cmd=""
  for venv_dir in services/meal-plan-engine/.venv services/*/venv; do
    if [[ -x "$venv_dir/bin/ruff" ]]; then
      ruff_cmd="$venv_dir/bin/ruff"
      break
    fi
  done
  if [[ -z "$ruff_cmd" ]]; then
    ruff_cmd=$(command -v ruff 2>/dev/null || true)
  fi

  if [[ -z "$ruff_cmd" ]]; then
    RESULTS+=('{"name":"python_lint","passed":true,"exit_code":0,"output":"ruff not found — skipping Python lint"}')
    return
  fi

  issues=$($ruff_cmd check $changed_py 2>&1) || exit_code=$?

  local passed="true"
  if [[ $exit_code -ne 0 ]]; then
    passed="false"
    OVERALL_PASS=false
  fi

  local truncated
  truncated=$(echo "$issues" | tail -30 | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')

  RESULTS+=("{\"name\":\"python_lint\",\"passed\":$passed,\"exit_code\":$exit_code,\"output\":\"$truncated\"}")
}

# Service boundary violation: detect cross-service DB table access
check_service_boundary() {
  local exit_code=0
  local issues=""

  cd "$WORK_DIR"

  # Table ownership (service → forbidden tables pattern)
  # user-service owns: users, bio_profiles, daily_logs, phi_access_logs, subscriptions
  # content-service owns: celebrities, base_diets, recipes, ingredients, recipe_ingredients
  # meal-plan-engine owns: meal_plans, instacart_orders
  local svc_dirs="services/user-service services/content-service services/meal-plan-engine"
  local forbidden_user="celebrities|base_diets|recipes[^_]|ingredients|recipe_ingredients|meal_plans|instacart_orders|content_research|content_posts"
  local forbidden_content="users|bio_profiles|daily_logs|phi_access_logs|subscriptions|meal_plans|instacart_orders"
  local forbidden_meal="users|bio_profiles|daily_logs|phi_access_logs|subscriptions|celebrities|base_diets|recipes[^_]|ingredients|recipe_ingredients|content_research|content_posts"

  for svc_dir in $svc_dirs; do
    [[ -d "$svc_dir/src" ]] || continue

    local pattern=""
    case "$svc_dir" in
      *user-service)      pattern="$forbidden_user" ;;
      *content-service)   pattern="$forbidden_content" ;;
      *meal-plan-engine)  pattern="$forbidden_meal" ;;
    esac

    [[ -z "$pattern" ]] && continue

    # Scan .ts and .py source files (exclude tests and node_modules)
    local matches
    matches=$(grep -rn --include='*.ts' --include='*.py' \
      -E "(FROM|INTO|UPDATE|JOIN|DELETE FROM)\s+(${pattern})" \
      "$svc_dir/src" 2>/dev/null | grep -v node_modules | grep -v '.test.' || true)

    if [[ -n "$matches" ]]; then
      issues+="SERVICE BOUNDARY VIOLATION in $svc_dir:\n$matches\n\n"
      exit_code=1
    fi
  done

  local passed="true"
  if [[ $exit_code -ne 0 ]]; then
    passed="false"
    OVERALL_PASS=false
  fi

  local truncated
  truncated=$(printf '%s' "$issues" | tail -30 | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr '\n' ' ')

  RESULTS+=("{\"name\":\"service_boundary\",\"passed\":$passed,\"exit_code\":$exit_code,\"output\":\"$truncated\"}")
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
  sql_schema)
    check_sql_schema_alignment
    ;;
  python_lint)
    check_python_lint
    ;;
  phi_audit)
    check_phi_audit
    ;;
  migration_freshness)
    check_migration_freshness
    ;;
  service_boundary)
    check_service_boundary
    ;;
  all)
    run_check "typecheck" "pnpm turbo run typecheck --force"
    run_check "lint" "pnpm turbo run lint --force"
    check_python_lint
    run_check "build" "pnpm turbo run build --force"
    run_check "test" "pnpm turbo run test --force"
    check_policy
    check_secrets
    check_fake_stubs
    check_sql_schema_alignment
    check_service_boundary
    check_phi_audit
    check_migration_freshness
    ;;
  *)
    echo "Unknown check: $CHECK" >&2
    echo "Available: typecheck, lint, python_lint, test, policy, secrets, sql_schema, service_boundary, phi_audit, migration_freshness, all" >&2
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
