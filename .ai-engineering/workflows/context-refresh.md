# Context Refresh

Refreshes `knowledge/*` docs when they've gone stale. Read-only for source code — only `knowledge/*` files may be edited. No implementation planning, no feature work during a refresh.

## When to run

On explicit request ("refresh context", "re-bootstrap", "update the AI setup") — not automatically. Between refreshes, if a task turns up a fact that contradicts a `knowledge/*` doc, mark `CONTEXT DRIFT` (or `CONTRACT DRIFT` for api/db/test/risk docs) in that task's output and keep going using source code as truth. Don't silently fix the doc mid-task.

## Files in scope

- `knowledge/architecture.md`
- `knowledge/api-contracts.md`
- `knowledge/db-contracts.md`
- `knowledge/module-ownership-map.md`
- `knowledge/risk-register.md`
- `knowledge/testing-strategy.md`
- `knowledge/environment.md`
- `knowledge/repository-map.md`

## Rules

- Every fact must be re-verified against source: code, tests, types, migrations, route definitions, controllers/services, components, `package.json` scripts, CI config, deployment docs.
- Never invent. Unknowns get `TODO: Fill after repository analysis. Do not treat as verified.`
- `repository-map.md` specifically: update only the entries touched by what prompted the refresh (or, for a full refresh, walk the whole map) — don't rewrite unrelated rows. This map exists so Claude doesn't re-grep the same symbols every session; a stale line number is `CONTEXT DRIFT`, fix it in the same turn you find it.
- This absorbs the old "update file indexes" trigger: after substantive edits, file moves/renames, or new feature creation, update only the stale `knowledge/repository-map.md` rows — don't wait for a full refresh cycle.

## Documentation Sync Rule

Every code change updates the matching `knowledge/*` entries in the same change — not deferred. Touch only the rows/sections the change actually affects. If a touched area has no existing entry, add one instead of leaving it unmapped.

## Output

```
## Refreshed
[file — what changed]

## Drift Found
[CONTEXT DRIFT / CONTRACT DRIFT entries]

## Still Unknown (TODO)
[items needing further analysis]

## Verification
- All facts re-verified against source
- No source code changed
- Drift marked with source reference
```
