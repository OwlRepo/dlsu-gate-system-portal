# AI Entry Point

Any AI agent must start here before code edits.

## Mandatory Load Order (Token-Efficient)
1. `docs/ai/architecture/code-map.md`
2. `docs/ai/architecture/feature-boundaries.md`
3. relevant `docs/ai/file-index/*.md`
4. relevant `docs/ai/architecture/*.md`
5. relevant `docs/ai/workflows/*.md`
6. related tests
7. target source files

## Semantic Search Protocol
1. `docs/ai/file-index`
2. `docs/ai/architecture/code-map.md`
3. `docs/ai/architecture/feature-boundaries.md`
4. semantic repo search
5. direct file inspection

Avoid full brute-force scans unless indexes are stale/missing.

## Task Classification
- Bug Fix
- Feature Implementation
- Enhancement
- Refactor
- Code Review
- Debugging
- API Change
- Database Change
- Dependency Upgrade
- Documentation Update

## Routing
- Bug Fix -> `docs/ai/workflows/bug-fix.md`
- Feature Implementation -> `docs/ai/workflows/feature-implementation.md`
- Enhancement -> `docs/ai/workflows/enhancement.md`
- Refactor -> `docs/ai/workflows/refactor.md`
- Code Review -> `docs/ai/workflows/code-review.md`
- Debugging -> `docs/ai/workflows/debugging.md`
- API Change -> `docs/ai/workflows/api-change.md`
- Database Change -> `docs/ai/workflows/database-change.md`
- Dependency Upgrade -> `docs/ai/workflows/dependency-upgrade.md`
- Documentation Update -> `docs/ai/workflows/enhancement.md`

## Hard Gate Before Editing
Do not edit until deterministic plan includes all required sections from `implementation-playbook.md`.
