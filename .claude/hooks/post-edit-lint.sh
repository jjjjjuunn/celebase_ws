#!/bin/bash
# PostToolUse 자동 lint — 파일 편집 후 실행
# 결과를 Claude에게 보여주되 차단하지 않음 (exit 0)

INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('file_path', ''))
except:
    print('')
" 2>/dev/null)

# TS/JS 파일만 lint
if [[ "$FILE" =~ \.(ts|tsx|js|jsx)$ ]]; then
  WS_ROOT="$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null)"
  if [ -n "$WS_ROOT" ] && [ -f "$WS_ROOT/package.json" ]; then
    echo "--- lint: $FILE ---"
    cd "$WS_ROOT" && pnpm eslint --quiet "$FILE" 2>&1 | tail -20
  fi
fi

exit 0
