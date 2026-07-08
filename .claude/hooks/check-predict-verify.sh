#!/bin/bash
# Enforce predict-verify acknowledgment before source code edits.
#
# Blocks Edit/Write/MultiEdit tool calls unless a fresh acknowledgment file
# exists at .claude/.predict-verify-ack, written by Claude per the Learning
# Contract in CLAUDE.md. This does NOT judge whether a task is genuinely a
# "new pattern" — that judgment call still belongs to Claude. What this
# enforces is that the judgment call actually gets made and recorded, every
# time, instead of silently skipped.

ACK_FILE=".claude/.predict-verify-ack"
MAX_AGE_SECONDS=900   # ack must be from the current work turn (~15 min)

# Read the tool call payload from stdin (Claude Code passes tool_input as JSON)
INPUT=$(cat)
TARGET_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')

# Don't gate edits to docs, the learning log itself, or config —
# only gate actual source code edits.
case "$TARGET_PATH" in
  *docs/ai/*|*learnings.md|*CLAUDE.md|*.claude/*|*README*|*.md)
    echo '{}'
    exit 0
    ;;
esac

if [ ! -f "$ACK_FILE" ]; then
  cat >&2 <<'MSG'
BLOCKED: no predict-verify acknowledgment found.

Before editing source code, run the Learning Contract check from CLAUDE.md:
- New pattern/library/design decision -> capture the prediction first, then
  write .claude/.predict-verify-ack with: {"status":"triggered","note":"<what's new>"}
- Matches an existing pattern already used in this repo -> write
  .claude/.predict-verify-ack with: {"status":"skipped","matches":"<existing pattern>"}

Then retry the edit.
MSG
  echo '{"permissionDecision":"deny","message":"No predict-verify acknowledgment. See stderr for what to write to .claude/.predict-verify-ack."}'
  exit 0
fi

ACK_MTIME=$(stat -c %Y "$ACK_FILE" 2>/dev/null || stat -f %m "$ACK_FILE" 2>/dev/null)
NOW=$(date +%s)
AGE=$(( NOW - ACK_MTIME ))

if [ "$AGE" -gt "$MAX_AGE_SECONDS" ]; then
  echo '{"permissionDecision":"deny","message":"predict-verify acknowledgment is stale (older than 15 min). Re-run the Learning Contract check for THIS task, then rewrite .claude/.predict-verify-ack before editing."}'
  exit 0
fi

echo '{}'
