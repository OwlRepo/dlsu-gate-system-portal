# Update File Indexes Workflow

## Trigger
- after substantive edits
- after file moves/renames
- after new feature creation
- when explicitly requested

## Steps
1. Run `git status`.
2. Run `git diff --name-only` as needed.
3. Map changed files to index documents.
4. Update only stale entries.
5. Add new files.
6. Remove deleted files.
7. Do not rewrite unrelated indexes.
8. For large rename batches, do focused refresh.
9. Keep entries concise.
