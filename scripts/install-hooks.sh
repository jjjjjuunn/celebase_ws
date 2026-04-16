#!/usr/bin/env bash
# Install git hooks for CelebBase.
# 1회 실행: bash scripts/install-hooks.sh

set -e

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

HOOKS_DIR=".git/hooks"
SRC_DIR="scripts/hooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "❌ $HOOKS_DIR not found. Run from inside the repo."
  exit 1
fi

for hook in pre-commit; do
  src="$SRC_DIR/$hook"
  dst="$HOOKS_DIR/$hook"
  if [ ! -f "$src" ]; then
    echo "⚠️  $src missing, skipping"
    continue
  fi
  cp "$src" "$dst"
  chmod +x "$dst"
  echo "✅ installed $dst"
done

echo ""
echo "Verify: .git/hooks/pre-commit exists and is executable"
ls -la .git/hooks/pre-commit
