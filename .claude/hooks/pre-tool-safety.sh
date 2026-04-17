#!/bin/bash
# PreToolUse 안전 장치 — CLAUDE.md Rule 13 강제
# exit 2 = 차단, exit 0 = 허용

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('command', ''))
except:
    print('')
" 2>/dev/null)

# Rule 13: --no-verify / CI 우회 금지
if echo "$COMMAND" | grep -qE '(--no-verify|--no-gpg-sign|-c\s+commit\.gpgsign=false)'; then
  echo "BLOCKED: --no-verify / hook 우회 금지 (CLAUDE.md Rule 13)" >&2
  exit 2
fi

# 루트/홈 대상 rm -rf 차단
if echo "$COMMAND" | grep -qE 'rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|--force\s+)?(\/\s|~\/?\s|\/\*|~\/\*)'; then
  echo "BLOCKED: 루트 또는 홈 디렉터리 대상 rm -rf 차단" >&2
  exit 2
fi

# 프로덕션 DB 직접 접근 패턴 차단 (DATABASE_URL에 prod 포함)
if echo "$COMMAND" | grep -qiE '(psql|mysql|mongosh).*prod'; then
  echo "BLOCKED: 프로덕션 DB 직접 접근 금지" >&2
  exit 2
fi

exit 0
