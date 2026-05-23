# Codex Handoff

Codex should be used for:
- local repository inspection
- precise file edits
- running tests
- running lint/typecheck
- producing diffs
- updating docs/ai indexes
- implementing scoped tasks

Rules:
- Codex must not start implementation until deterministic plan is complete unless task is trivial.
- For behavior-changing code tasks, strict TDD is required (RED -> GREEN -> REFACTOR).
