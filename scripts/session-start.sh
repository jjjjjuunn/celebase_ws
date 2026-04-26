#!/usr/bin/env bash
# session-start.sh — Multi-session coordination helper
#
# 사용법:
#   scripts/session-start.sh <ROLE> <TASK-ID>
#     ROLE: fe | be | bff
#     TASK-ID: docs/IMPLEMENTATION_LOG.md 의 다음 작업 ID (자유 형식, 케밥/언더스코어 모두 가능)
#
# 효과:
#   1. origin fetch + prune
#   2. main 대비 현재 브랜치 상태 출력
#   3. 최근 24h 다른 세션 활동 감지
#   4. shared-types 변경 알림
#   5. 48h 미머지 브랜치 경고 ("이틀 룰")
#   6. 도메인 별 권장 디렉토리 / 금지 영역 출력
#   7. 작업 브랜치 미존재 시 생성

set -euo pipefail

ROLE="${1:-}"
TASK_ID="${2:-}"

if [[ -z "$ROLE" || -z "$TASK_ID" ]]; then
  echo "Usage: $0 <fe|be|bff> <TASK-ID>" >&2
  echo "  TASK-ID 는 docs/IMPLEMENTATION_LOG.md 다음 항목 ID (자유 형식)" >&2
  exit 1
fi

case "$ROLE" in
  fe|be|bff) ;;
  *) echo "ERROR: ROLE must be one of fe|be|bff (got: $ROLE)" >&2; exit 1 ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "================================================================"
echo "  Session Start — role=$ROLE task=$TASK_ID"
echo "================================================================"

echo ""
echo "[1/6] git fetch origin --prune"
git fetch origin --prune 2>&1 | sed 's/^/  /'

echo ""
echo "[2/6] main 대비 현재 브랜치"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "  현재 브랜치: $CURRENT_BRANCH"
echo "  HEAD: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
AHEAD="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo '?')"
BEHIND="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo '?')"
echo "  origin/main 대비: ahead $AHEAD / behind $BEHIND"
DIRTY="$(git status --porcelain | wc -l | tr -d ' ')"
if [[ "$DIRTY" -gt 0 ]]; then
  echo "  ⚠️  uncommitted changes: $DIRTY files"
fi

echo ""
echo "[3/6] 최근 24h 다른 브랜치 활동 (origin)"
RECENT="$(git for-each-ref --sort=-committerdate refs/remotes/origin --format='%(committerdate:relative)|%(refname:short)|%(authorname)' --count=20 \
  | awk -F'|' '$1 ~ /(hour|minute|day) ago/ && $1 !~ /^[0-9]+ days/ || $1 ~ /^1 day/ {print}')"
if [[ -z "$RECENT" ]]; then
  echo "  (없음)"
else
  echo "$RECENT" | sed 's/^/  /'
fi

echo ""
echo "[4/6] shared-types 최근 24h 변경"
SHARED_LOG="$(git log origin/main --since='24 hours ago' --oneline -- packages/shared-types 2>/dev/null || true)"
if [[ -z "$SHARED_LOG" ]]; then
  echo "  (없음)"
else
  echo "$SHARED_LOG" | sed 's/^/  /'
  echo "  ⚠️  shared-types 가 최근 변경됨 — pnpm install + 의존 코드 재확인 필요"
fi

echo ""
echo "[5/6] 48h 미머지 브랜치 (이틀 룰 위반)"
STALE="$(git for-each-ref --format='%(committerdate:unix)|%(refname:short)' refs/heads | \
  awk -F'|' -v now="$(date +%s)" -v cutoff="$((48*3600))" \
  '$1 != "" && (now - $1) > cutoff && $2 != "main" {print $2}' || true)"
if [[ -z "$STALE" ]]; then
  echo "  (없음)"
else
  echo "$STALE" | sed 's/^/  ⚠️  /'
  echo "  → 위 브랜치는 48h 이상 main 미반영. 통합 PR 생성을 첫 작업으로 권장."
fi

echo ""
echo "[6/6] 도메인 경계 (role=$ROLE)"
case "$ROLE" in
  fe)
    cat <<'EOF'
  ✅ 작업 영역:
     apps/web/src/**  (단, app/api/** 제외)
     packages/ui-kit/**
     packages/design-tokens/**
  ❌ 금지 영역:
     services/**
     db/migrations/**
     apps/web/src/app/api/**
EOF
    ;;
  be)
    cat <<'EOF'
  ✅ 작업 영역:
     services/**/src/**
     services/**/tests/**
     db/migrations/**
  ❌ 금지 영역:
     apps/web/**
     packages/ui-kit/**
     packages/design-tokens/**
EOF
    ;;
  bff)
    cat <<'EOF'
  ✅ 작업 영역:
     apps/web/src/app/api/**
     apps/web/src/lib/server/**
  ❌ 금지 영역:
     services/** 내부 로직
     packages/ui-kit/** 컴포넌트
  ⚠️  BFF 는 BE/FE shape 안정 후 진입 권장
EOF
    ;;
esac

echo ""
echo "  📌 shared-types 는 단 한 세션이 hold 후 머지. 동시 수정 금지."

echo ""
echo "[branch] 작업 브랜치 확인"
TASK_LOWER="$(echo "$TASK_ID" | tr '[:upper:]' '[:lower:]')"
EXPECTED_BRANCH=""
for prefix in feat fix chore; do
  if git rev-parse --verify --quiet "${prefix}/${TASK_LOWER}" >/dev/null; then
    EXPECTED_BRANCH="${prefix}/${TASK_LOWER}"
    break
  fi
  # match feat/<task-lower>-<slug>
  match="$(git for-each-ref --format='%(refname:short)' "refs/heads/${prefix}/${TASK_LOWER}-*" | head -1)"
  if [[ -n "$match" ]]; then
    EXPECTED_BRANCH="$match"
    break
  fi
done

if [[ -n "$EXPECTED_BRANCH" ]]; then
  echo "  기존 브랜치 발견: $EXPECTED_BRANCH"
  if [[ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]]; then
    echo "  → git checkout $EXPECTED_BRANCH"
  fi
else
  SUGGESTED="feat/${TASK_LOWER}"
  echo "  미존재. 권장 브랜치명: $SUGGESTED"
  echo "  → git checkout -b $SUGGESTED origin/main"
fi

echo ""
echo "================================================================"
echo "  세션 준비 완료. .claude/rules/multi-session.md 참고."
echo "================================================================"
