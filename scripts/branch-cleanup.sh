#!/usr/bin/env bash
# branch-cleanup.sh — origin 브랜치 누적 방지 정기 점검
#
# 사용법:
#   scripts/branch-cleanup.sh           # 분류만 출력 (dry-run)
#   scripts/branch-cleanup.sh --apply   # SAFE 카테고리 자동 삭제
#
# 분류:
#   SAFE    — PR MERGED + main 대비 ahead=0           → --apply 시 자동 삭제
#   ABSORBED— PR MERGED/CLOSED + ahead>0 (squash 흔적) → 수동 확인 후 삭제
#   ACTIVE  — PR OPEN  또는 7일 이내 push              → 보존
#   STALE   — PR 없음 + 14일 이상 미활동                → 수동 확인
#
# main / HEAD 는 항상 보존.

set -euo pipefail

APPLY=0
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=1
fi

echo "▶ git fetch origin --prune"
git fetch origin --prune >/dev/null 2>&1

DEFAULT_BRANCH="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||' || echo main)"

now_epoch="$(date +%s)"
declare -a SAFE=()
declare -a ABSORBED=()
declare -a ACTIVE=()
declare -a STALE=()

# origin 브랜치 순회
while IFS= read -r branch; do
  [[ -z "$branch" ]] && continue
  [[ "$branch" == "$DEFAULT_BRANCH" ]] && continue

  ahead="$(git rev-list --count "origin/${DEFAULT_BRANCH}..origin/${branch}" 2>/dev/null || echo 0)"

  last_commit_epoch="$(git log -1 --format=%ct "origin/${branch}" 2>/dev/null || echo 0)"
  age_days=$(( (now_epoch - last_commit_epoch) / 86400 ))

  pr_json="$(gh pr list --state all --head "$branch" --json number,state --jq '.[0]' 2>/dev/null || echo '')"
  pr_state="$(echo "$pr_json" | jq -r '.state // "NONE"' 2>/dev/null || echo NONE)"
  pr_number="$(echo "$pr_json" | jq -r '.number // ""' 2>/dev/null || echo '')"

  row="$branch|ahead=$ahead|age=${age_days}d|PR=${pr_state}${pr_number:+#${pr_number}}"

  if [[ "$pr_state" == "MERGED" && "$ahead" -eq 0 ]]; then
    SAFE+=("$row")
  elif [[ ( "$pr_state" == "MERGED" || "$pr_state" == "CLOSED" ) && "$ahead" -gt 0 ]]; then
    ABSORBED+=("$row")
  elif [[ "$pr_state" == "OPEN" || "$age_days" -lt 7 ]]; then
    ACTIVE+=("$row")
  else
    STALE+=("$row")
  fi
done < <(git branch -r --no-color | sed 's|^[[:space:]]*||' | grep -v ' -> ' | sed 's|^origin/||')

print_section() {
  local label="$1"; shift
  local count="$1"; shift
  echo
  echo "── ${label} (${count}) ──"
  if [[ "$count" -eq 0 ]]; then
    echo "  (없음)"
  else
    printf '  %s\n' "$@"
  fi
}

print_section "SAFE  (PR MERGED + ahead=0 — 자동 삭제 후보)" "${#SAFE[@]}" ${SAFE[@]+"${SAFE[@]}"}
print_section "ABSORBED (PR closed but ahead>0 — squash 흔적, 수동 확인)" "${#ABSORBED[@]}" ${ABSORBED[@]+"${ABSORBED[@]}"}
print_section "ACTIVE (PR OPEN 또는 7일 이내 push — 보존)" "${#ACTIVE[@]}" ${ACTIVE[@]+"${ACTIVE[@]}"}
print_section "STALE (PR 없음 + 14일 이상 — 수동 확인)" "${#STALE[@]}" ${STALE[@]+"${STALE[@]}"}

if [[ "$APPLY" -eq 1 ]]; then
  if [[ "${#SAFE[@]}" -eq 0 ]]; then
    echo
    echo "✅ 삭제할 SAFE 브랜치 없음."
    exit 0
  fi
  echo
  echo "▶ SAFE 카테고리 일괄 삭제 (--apply)"
  for row in "${SAFE[@]}"; do
    branch="${row%%|*}"
    git push origin --delete "$branch"
  done
  echo "✅ SAFE 브랜치 ${#SAFE[@]}개 삭제 완료."
else
  echo
  echo "ℹ️  dry-run 모드. SAFE 카테고리를 실제 삭제하려면:"
  echo "    scripts/branch-cleanup.sh --apply"
  echo
  echo "ℹ️  ABSORBED / STALE 은 수동 확인 후 개별 삭제:"
  echo "    git push origin --delete <branch-name>"
fi
