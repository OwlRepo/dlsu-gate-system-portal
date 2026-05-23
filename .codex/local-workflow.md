# Codex Local Workflow

## Start
- Open VS Code terminal at repo root.
- Start Codex CLI in this workspace.

## Scoped Tasking
- Provide task + expected behavior + specific paths.
- Point Codex to `docs/ai/entry-point.md` for context loading.

## Token Efficiency
- Ask for relevant index/architecture/workflow docs only.
- Avoid full-repo reads unless indexes are stale.

## Modes to Request
- Plan-only mode: deterministic plan before edits.
- Implementation mode: execute approved plan.
- Review mode: bug/risk/test focused review only.
