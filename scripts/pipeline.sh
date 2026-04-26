#!/usr/bin/env bash
# pipeline.sh — Claude-Codex 9-Step Pipeline Orchestrator
#
# Claude가 각 단계를 순차 호출한다. 완전 자동 실행이 아닌, Claude 판단이 개입하는 구조.
#
# Usage:
#   scripts/pipeline.sh <task-id> <step> [options]
#
# Steps:
#   init           — 파이프라인 실행 환경 초기화 (디렉토리, 워크트리 생성)
#   implement      — Codex에게 구현 위임 (codex exec)
#   gate-implement — 자동 게이트 체크 실행 (결과를 Claude가 판정)
#   review         — Codex에게 독립 리뷰 위임 (codex review)
#   gate-review    — 리뷰 게이트 체크 (결과를 Claude가 판정)
#   fix            — Codex에게 수정 위임 (fix-request 기반)
#   qa-exec        — Codex에게 QA 실행 위임
#   gate-qa        — QA 게이트 체크 (결과를 Claude가 판정)
#   finalize       — 워크트리 정리, 브랜치 머지 준비
#   status         — 현재 파이프라인 상태 출력
#
# Options:
#   --model <model>    Codex 모델 지정 (기본: o3)
#   --base <branch>    베이스 브랜치 (기본: main)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Arguments ──────────────────────────────────────
TASK_ID="${1:?Usage: pipeline.sh <task-id> <step>}"
STEP="${2:?Usage: pipeline.sh <task-id> <step>}"
shift 2

CODEX_MODEL="o3"
BASE_BRANCH="main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --model) CODEX_MODEL="$2"; shift 2 ;;
    --base) BASE_BRANCH="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── Paths ──────────────────────────────────────────
RUN_DIR="$PROJECT_ROOT/pipeline/runs/$TASK_ID"
WORKTREE_DIR="$PROJECT_ROOT/.worktrees/$TASK_ID"
BRANCH_NAME="pipeline/$TASK_ID"
LOG_FILE="$RUN_DIR/pipeline-log.jsonl"

# ── Helpers ────────────────────────────────────────
timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log_event() {
  local step="$1"
  local status="$2"
  local message="${3:-}"
  echo "{\"timestamp\":\"$(timestamp)\",\"task_id\":\"$TASK_ID\",\"step\":\"$step\",\"status\":\"$status\",\"message\":\"$message\"}" >> "$LOG_FILE"
}

ensure_run_dir() {
  mkdir -p "$RUN_DIR"
  if [[ ! -f "$LOG_FILE" ]]; then
    touch "$LOG_FILE"
  fi
}

# Run codex exec reading prompt from a file via stdin.
# Usage: run_codex <prompt_file> <output_file>
# Returns codex's exit code (not tee's).
run_codex() {
  local prompt_file="$1"
  local output_file="$2"

  # CODEX-INSTRUCTIONS.md를 prompt에 prepend하여 Codex가 반드시 읽도록 한다.
  # codex exec -c model_instructions_file=... 은 유효하지 않은 config 키 — 무시됨.
  # stdin prepend가 CODEX-INSTRUCTIONS.md를 주입하는 가장 확실한 방법이다.
  local combined_prompt
  combined_prompt="$(mktemp)"
  {
    printf "# Project Instructions (from CODEX-INSTRUCTIONS.md)\n\n"
    cat "$PROJECT_ROOT/CODEX-INSTRUCTIONS.md"
    printf "\n\n---\n\n# Task\n\n"
    cat "$prompt_file"
  } > "$combined_prompt"

  # Use stdin (-) so file content is never shell-expanded.
  # PIPESTATUS[0] captures codex exit code even with pipefail enabled.
  set +e
  codex exec \
    --full-auto \
    --cd "$WORKTREE_DIR" \
    -m "$CODEX_MODEL" \
    - \
    < "$combined_prompt" \
    2>&1 | tee "$output_file"
  local pipe_exit=("${PIPESTATUS[@]}")
  set -e

  rm -f "$combined_prompt"
  return "${pipe_exit[0]}"
}

# ── Steps ──────────────────────────────────────────

step_init() {
  echo "=== Pipeline Init: $TASK_ID ==="
  ensure_run_dir

  # Create worktree if it doesn't exist
  if [[ ! -d "$WORKTREE_DIR" ]]; then
    mkdir -p "$(dirname "$WORKTREE_DIR")"
    git -C "$PROJECT_ROOT" worktree add "$WORKTREE_DIR" -b "$BRANCH_NAME" "$BASE_BRANCH" 2>/dev/null || \
    git -C "$PROJECT_ROOT" worktree add "$WORKTREE_DIR" "$BRANCH_NAME" 2>/dev/null || {
      echo "ERROR: Failed to create worktree" >&2
      log_event "init" "error" "Failed to create worktree"
      exit 1
    }
    echo "Created worktree at: $WORKTREE_DIR"
    echo "Branch: $BRANCH_NAME"
  else
    echo "Worktree already exists at: $WORKTREE_DIR"
  fi

  log_event "init" "done" "Run dir: $RUN_DIR, Worktree: $WORKTREE_DIR"

  # Output paths for Claude to capture
  echo ""
  echo "{ \"run_dir\": \"$RUN_DIR\", \"worktree\": \"$WORKTREE_DIR\", \"branch\": \"$BRANCH_NAME\" }"
}

step_implement() {
  echo "=== Step 2: Codex Implement ==="
  ensure_run_dir

  local handoff="$RUN_DIR/CODEX-HANDOFF.md"
  if [[ ! -f "$handoff" ]]; then
    echo "ERROR: $handoff not found. Claude must create it first (Step 1)." >&2
    log_event "implement" "error" "CODEX-HANDOFF.md not found"
    exit 1
  fi

  log_event "implement" "started" "Model: $CODEX_MODEL"

  echo "Running codex exec in worktree: $WORKTREE_DIR"
  echo "Model: $CODEX_MODEL"
  echo "---"

  # Prompt is piped via stdin to avoid shell-expansion of backticks/quotes in HANDOFF.md
  run_codex "$handoff" "$RUN_DIR/codex-implement-output.txt"
  local codex_exit=$?

  if [[ $codex_exit -eq 0 ]]; then
    log_event "implement" "done" "Codex exited successfully"
  else
    log_event "implement" "error" "Codex exited with code $codex_exit"
  fi

  echo ""
  echo "Output saved to: $RUN_DIR/codex-implement-output.txt"
  return $codex_exit
}

step_gate_implement() {
  echo "=== Step 3: Implement Gate (Auto Checks) ==="
  ensure_run_dir

  log_event "gate-implement" "started" ""

  # Validate that Codex actually changed files (P3: detect silent no-op)
  local changed_count
  changed_count=$(git -C "$WORKTREE_DIR" diff --name-only "$BASE_BRANCH"...HEAD -- '*.ts' '*.tsx' '*.py' '*.sql' '*.sh' 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$changed_count" -eq 0 ]]; then
    echo "ERROR: No source files changed in branch. Codex may have failed silently." >&2
    echo "{\"status\":\"fail\",\"timestamp\":\"$(timestamp)\",\"checks\":[{\"name\":\"file-changes\",\"passed\":false,\"exit_code\":1,\"output\":\"No source files changed in worktree branch\"}]}" > "$RUN_DIR/gate-implement.json"
    log_event "gate-implement" "fail" "No files changed — Codex silent failure"
    echo ""
    echo "=== Gate Result ==="
    cat "$RUN_DIR/gate-implement.json"
    return 1
  fi

  local gate_exit=0
  "$SCRIPT_DIR/gate-check.sh" all \
    --cd "$WORKTREE_DIR" \
    --output "$RUN_DIR/gate-implement.json" \
    2>&1 || gate_exit=$?

  # Always output result for Claude to judge
  echo ""
  echo "=== Gate Result ==="
  cat "$RUN_DIR/gate-implement.json"

  if [[ $gate_exit -ne 0 ]]; then
    log_event "gate-implement" "fail" "Auto checks failed (exit $gate_exit), Claude must judge"
  else
    log_event "gate-implement" "awaiting-judgment" "Auto checks passed, Claude must judge"
  fi
}

step_review() {
  echo "=== Step 4: Codex Review ==="
  ensure_run_dir

  log_event "review" "started" ""

  echo "Running codex review on worktree..."

  # Write review prompt to file — avoids shell-expansion of CODEX-INSTRUCTIONS.md content
  local review_prompt="$RUN_DIR/review-prompt.txt"
  {
    cat <<'HEADER'
Review all code changes in this repository (compare to the base branch).
Check for each of the following and assign severity CRITICAL / HIGH / MEDIUM / LOW:

1. Security: hardcoded secrets, SQL injection, XSS, SSRF, missing Zod validation
2. Architecture: cross-service DB access, missing parameterized queries
3. Code quality: `any` types, empty `catch {}`, stray debug logging, magic numbers
4. Test coverage: new logic without corresponding tests
5. PHI handling: health fields without AES-256 encryption, missing audit logs, fail-open patterns
6. Database rules: UUID v4 used instead of v7, missing soft-delete, potential N+1 queries

Reference project rules:
HEADER
    cat "$PROJECT_ROOT/CODEX-INSTRUCTIONS.md"
    echo ""
    echo "---"
    echo "Output a structured review. Group findings by severity. End with a PASS / FAIL verdict."
  } > "$review_prompt"

  run_codex "$review_prompt" "$RUN_DIR/codex-review.txt"
  local codex_exit=$?
  log_event "review" "done" "Exit code: $codex_exit"

  echo ""
  echo "Review saved to: $RUN_DIR/codex-review.txt"
}

step_gate_review() {
  echo "=== Step 5: Review Gate (Auto Checks) ==="
  ensure_run_dir

  log_event "gate-review" "started" ""

  local gate_exit=0
  "$SCRIPT_DIR/gate-check.sh" secrets \
    --cd "$WORKTREE_DIR" \
    --output "$RUN_DIR/gate-review.json" \
    2>&1 || gate_exit=$?

  echo ""
  echo "=== Gate Result ==="
  cat "$RUN_DIR/gate-review.json"
  echo ""
  echo "=== Review Content ==="
  cat "$RUN_DIR/codex-review.txt" 2>/dev/null || echo "(no review output)"

  if [[ $gate_exit -ne 0 ]]; then
    log_event "gate-review" "fail" "Secret scan failed (exit $gate_exit), Claude must judge"
  else
    log_event "gate-review" "awaiting-judgment" "Auto checks passed, Claude must judge review findings"
  fi
}

step_fix() {
  echo "=== Fix Cycle: Codex Fix ==="
  ensure_run_dir

  # Find the latest fix-request
  local fix_request
  fix_request=$(ls -1 "$RUN_DIR"/fix-request-*.md 2>/dev/null | sort -V | tail -1)

  if [[ -z "$fix_request" ]]; then
    echo "ERROR: No fix-request-N.md found in $RUN_DIR. Claude must create it first." >&2
    log_event "fix" "error" "No fix-request found"
    exit 1
  fi

  local iteration
  iteration=$(basename "$fix_request" | sed 's/fix-request-\([0-9]*\)\.md/\1/')

  if [[ "$iteration" -gt 3 ]]; then
    echo "ERROR: Max iterations (3) reached. ESCALATE_TO_HUMAN." >&2
    log_event "fix" "escalate" "Max iterations reached"
    exit 2
  fi

  log_event "fix" "started" "Iteration: $iteration"

  echo "Running Codex fix (iteration $iteration/3)..."
  echo "Fix request: $fix_request"

  # Pipe fix-request via stdin — avoids shell expansion of TypeScript code in fix docs
  run_codex "$fix_request" "$RUN_DIR/codex-fix-${iteration}-output.txt"
  local codex_exit=$?
  log_event "fix" "done" "Iteration $iteration, exit code: $codex_exit"

  echo ""
  echo "Fix output saved to: $RUN_DIR/codex-fix-${iteration}-output.txt"
}

step_qa_exec() {
  echo "=== Step 7: Codex QA Execution ==="
  ensure_run_dir

  local qa_plan="$RUN_DIR/QA-PLAN.md"
  if [[ ! -f "$qa_plan" ]]; then
    echo "ERROR: $qa_plan not found. Claude must create it first (Step 6)." >&2
    log_event "qa-exec" "error" "QA-PLAN.md not found"
    exit 1
  fi

  log_event "qa-exec" "started" ""

  # Pre-install Python dependencies so Codex can run pytest in its sandbox.
  # Without this, Codex has no PyPI access and creates fake pytest stubs.
  local py_svc_dir="$WORKTREE_DIR/services/meal-plan-engine"
  if [[ -f "$py_svc_dir/requirements.txt" ]]; then
    echo "Setting up Python venv for Codex QA..."
    python3 -m venv "$py_svc_dir/.venv" 2>/dev/null || true
    "$py_svc_dir/.venv/bin/pip" install -q -r "$py_svc_dir/requirements.txt" ruff 2>&1 | tail -5 || true
    # Symlink so Codex can also use bare `python3` and `pytest` from the venv
    ln -sf "$py_svc_dir/.venv/bin/python" "$WORKTREE_DIR/.venv-python" 2>/dev/null || true
    echo "Python venv ready at: $py_svc_dir/.venv"
  fi

  echo "Running Codex QA..."

  # Write combined prompt to file — avoids shell-expansion of QA-PLAN.md content
  local qa_prompt="$RUN_DIR/qa-prompt.txt"
  {
    echo "Execute the following QA plan."
    echo ""
    echo "IMPORTANT RULES:"
    echo "- A Python venv with all dependencies is pre-installed at services/meal-plan-engine/.venv"
    echo "- Run pytest using: cd services/meal-plan-engine && .venv/bin/python -m pytest tests/ -v --tb=short"
    echo "- Do NOT create any pytest/ directory or test stub files. Dependencies are already installed."
    echo "- Do NOT run pip install — all packages are pre-installed in the venv."
    echo "- Also run: .venv/bin/ruff check src/ tests/ and other static checks from the QA plan."
    echo ""
    cat "$qa_plan"
  } > "$qa_prompt"

  run_codex "$qa_prompt" "$RUN_DIR/qa-results.txt"
  local codex_exit=$?
  log_event "qa-exec" "done" "Exit code: $codex_exit"

  echo ""
  echo "QA results saved to: $RUN_DIR/qa-results.txt"
}

step_gate_qa() {
  echo "=== Step 8: QA Gate (Auto Checks) ==="
  ensure_run_dir

  log_event "gate-qa" "started" ""

  local gate_exit=0
  "$SCRIPT_DIR/gate-check.sh" all \
    --cd "$WORKTREE_DIR" \
    --output "$RUN_DIR/gate-qa.json" \
    2>&1 || gate_exit=$?

  echo ""
  echo "=== Gate Result ==="
  cat "$RUN_DIR/gate-qa.json"
  echo ""
  echo "=== QA Results ==="
  cat "$RUN_DIR/qa-results.txt" 2>/dev/null || echo "(no QA output)"

  if [[ $gate_exit -ne 0 ]]; then
    log_event "gate-qa" "fail" "Auto checks failed (exit $gate_exit), Claude must judge QA results"
  else
    log_event "gate-qa" "awaiting-judgment" "Auto checks passed, Claude must judge QA results"
  fi
}

step_finalize() {
  echo "=== Step 9: Finalize ==="
  ensure_run_dir

  log_event "finalize" "started" ""

  # Commit all changes in worktree
  cd "$WORKTREE_DIR"
  if [[ -n "$(git status --porcelain)" ]]; then
    git add -A
    git commit -m "feat($TASK_ID): pipeline implementation complete"
  fi

  echo "Branch $BRANCH_NAME is ready for PR."
  echo "Worktree: $WORKTREE_DIR"

  log_event "finalize" "done" "Branch ready: $BRANCH_NAME"

  # Summary
  echo ""
  echo "=== Pipeline Summary ==="
  echo "Task: $TASK_ID"
  echo "Branch: $BRANCH_NAME"
  echo "Worktree: $WORKTREE_DIR"
  echo "Run artifacts: $RUN_DIR"
  echo ""
  echo "Next: Claude creates PR and updates tasks.yaml + IMPLEMENTATION_LOG.md"
}

step_status() {
  echo "=== Pipeline Status: $TASK_ID ==="
  ensure_run_dir

  echo "Run dir: $RUN_DIR"
  echo "Worktree: $WORKTREE_DIR ($(test -d "$WORKTREE_DIR" && echo "exists" || echo "not created"))"
  echo "Branch: $BRANCH_NAME"
  echo ""

  if [[ -f "$LOG_FILE" ]]; then
    echo "=== Event Log ==="
    cat "$LOG_FILE"
  else
    echo "No events logged yet."
  fi

  echo ""
  echo "=== Artifacts ==="
  ls -1 "$RUN_DIR" 2>/dev/null || echo "(empty)"
}

# ── Dispatch ───────────────────────────────────────
case "$STEP" in
  init)           step_init ;;
  implement)      step_implement ;;
  gate-implement) step_gate_implement ;;
  review)         step_review ;;
  gate-review)    step_gate_review ;;
  fix)            step_fix ;;
  qa-exec)        step_qa_exec ;;
  gate-qa)        step_gate_qa ;;
  finalize)       step_finalize ;;
  status)         step_status ;;
  *)
    echo "Unknown step: $STEP" >&2
    echo "Available: init, implement, gate-implement, review, gate-review, fix, qa-exec, gate-qa, finalize, status" >&2
    exit 1
    ;;
esac
