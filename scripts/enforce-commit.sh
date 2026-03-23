#!/usr/bin/env bash
# Enforce conventional commit message format
# Used as commit-msg hook via pre-commit

MSG_FILE="$1"
MSG=$(head -1 "$MSG_FILE")

if [[ "$MSG" =~ ^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:.+ ]]; then
  exit 0
fi

echo "ERROR: Commit message must follow Conventional Commits format."
echo "  e.g., feat: add batch size config"
echo "  e.g., fix(content): handle stale DOM after archive"
echo "  Got: $MSG"
exit 1
