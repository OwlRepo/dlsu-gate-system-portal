#!/bin/sh
# Fresh task worktree per docs/ai/execution.md "Worktree and branch isolation":
# fetch origin first, branch from origin/main HEAD, never reuse stale worktrees.
set -eu

if [ $# -ne 2 ]; then
  echo "Usage: scripts/new-task-worktree.sh <fix|feat|enhancement|refactor|perf|infra|chore|docs> <short-name>" >&2
  exit 1
fi

type="$1"
name="$2"

case "$type" in
  fix|feat|enhancement|refactor|perf|infra|chore|docs) ;;
  *)
    echo "Invalid type '$type'. Use: fix|feat|enhancement|refactor|perf|infra|chore|docs" >&2
    exit 1
    ;;
esac

# Resolve the MAIN repo root even when invoked from inside a worktree
# (--show-toplevel would return the worktree root and nest worktrees).
common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
root="$(dirname "$common_dir")"
branch="$type/no-ticket-$name"
dir="$root/.claude/worktrees/$type-$name"

if [ -e "$dir" ]; then
  echo "Worktree directory already exists: $dir" >&2
  exit 1
fi

git fetch origin
git worktree add --no-track "$dir" -b "$branch" origin/main

# Share the primary checkout's dependencies instead of installing per worktree
# (never run `bun install` inside the worktree: it would write through the links).
for rel in "" apps/backend apps/portal-web packages/eslint-config packages/typescript-config packages/ui; do
  src="$root/${rel:+$rel/}node_modules"
  dst="$dir/${rel:+$rel/}node_modules"
  if [ -d "$src" ] && [ -d "$(dirname "$dst")" ] && [ ! -e "$dst" ]; then
    ln -s "$src" "$dst"
  fi
done

echo ""
echo "Worktree ready. Next:"
echo "  cd $dir"
