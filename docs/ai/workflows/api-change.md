# Workflow

## When to use
Use this workflow when task classification matches this file name.

## Required context files
- `docs/ai/entry-point.md`
- `docs/ai/architecture/code-map.md`
- `docs/ai/architecture/feature-boundaries.md`
- relevant `docs/ai/file-index/*.md`
- relevant `docs/ai/architecture/*.md`

## Required inspection steps
- verify target file paths
- inspect exact symbols to change
- inspect imports/exports and consumers
- inspect related tests

## Planning requirements
Create deterministic plan using `docs/ai/implementation-playbook.md` sections, including:
- Behavior Test Matrix
- Code-Fact Evidence

## Implementation rules
- small scoped diffs
- preserve established architecture patterns
- ask for explicit confirmation on high-risk changes

## Verification commands
Run strongest safe checks in order from `docs/ai/verification.md`.

## Documentation updates
Update affected:
- architecture docs
- file indexes
- workflow notes when patterns change

## Rollback
Define safe rollback steps before implementation.
