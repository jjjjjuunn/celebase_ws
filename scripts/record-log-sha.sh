#!/usr/bin/env bash
# record-log-sha.sh
# IMPLEMENTATION_LOG.md의 `commit_sha: PENDING`을 실제 SHA로 치환한다.
#
# 사용:
#   feat/fix 커밋 직후:
#     bash scripts/record-log-sha.sh <TASK-ID>
#     git add docs/IMPLEMENTATION_LOG.md
#     git commit -m "docs(log): record <TASK-ID> commit SHA"
#
# 동작:
#   1. <TASK-ID>에 해당하는 PENDING 엔트리 1건을 찾는다
#   2. HEAD의 짧은 SHA (7자리)를 읽는다
#   3. 해당 엔트리의 commit_sha 필드만 치환
#   4. 다른 엔트리에 PENDING이 남아있으면 에러 (top-entry only 규칙)

set -e

TASK_ID="${1:-}"
if [ -z "$TASK_ID" ]; then
  echo "Usage: $0 <TASK-ID>"
  echo "Example: $0 IMPL-014"
  exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

LOG="docs/IMPLEMENTATION_LOG.md"
SHA=$(git rev-parse --short=7 HEAD)

echo "TASK_ID: $TASK_ID"
echo "HEAD SHA: $SHA"

# task_id와 commit_sha: PENDING이 인접한 엔트리의 PENDING을 치환
# Python으로 안전하게 처리 (sed의 multiline 한계 회피)
python3 - "$TASK_ID" "$SHA" "$LOG" <<'PY'
import re
import sys

task_id, sha, path = sys.argv[1], sys.argv[2], sys.argv[3]

with open(path, encoding="utf-8") as f:
    content = f.read()

# 엔트리 블록 단위로 접근: ---\n...\n---
pattern = re.compile(r"(---\n(?:[^-].*?\n)*?---)", re.DOTALL)
blocks = pattern.findall(content)

target_block = None
for b in blocks:
    if f"task_id: {task_id}" in b and "commit_sha: PENDING" in b:
        target_block = b
        break

if target_block is None:
    print(f"❌ No entry found with task_id={task_id} and commit_sha=PENDING")
    sys.exit(1)

new_block = target_block.replace("commit_sha: PENDING", f"commit_sha: {sha}")
content_new = content.replace(target_block, new_block, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content_new)

print(f"✅ Replaced PENDING → {sha} in {task_id} entry")
PY

# validator로 이중 확인
if command -v python3 >/dev/null 2>&1 && python3 -c "import yaml" 2>/dev/null; then
  python3 scripts/validate_impl_log.py
else
  echo "⚠️ PyYAML 미설치 — validator 스킵 (설치 권장)"
fi

echo ""
echo "다음 단계:"
echo "  git add $LOG"
echo "  git commit -m \"docs(log): record $TASK_ID commit SHA\""
