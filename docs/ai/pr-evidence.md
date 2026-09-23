# Mandatory Pull Request Evidence

> Purpose: what evidence a PR must carry before it is ready for review, by change type.
> Load rule: read before creating any PR — pointed to from `docs/ai/handoff.md`.
> Source of truth: this is a MAP. Where it asks for facts governed elsewhere (migrations, tests, refactor safety, performance), that governing doc wins — this file only requires reporting them.

A PR is not complete until its evidence matches its Change Type and has actually been produced — never claimed without running it. There is no CI, so the evidence in the body IS the check a reviewer relies on.

## Change Type

One or more of: `UI / portal` · `Backend / API` · `Database` · `Bug fix` · `Refactor` · `Performance` · `Infrastructure / deploy` · `Tooling / docs`.

This tags the diff, distinct from the routing Intent in `docs/ai/task-router.md`.

## Evidence by Change Type

### UI / portal

A short screen recording (not a screenshot unless requested) showing the starting state, the user actions, the result, and the loading/empty/error/responsive behaviour. Produce it by walking the flow in the Browser tool against `bun run dev:web` (mock mode where the backend is not needed). GitHub has no CLI path to attach a video to a PR body: hand the file over with `SendUserFile` and open the PR as a draft until it is attached.

### Backend / API / database / logic-only

No recording unless there is user-visible behaviour. Include: previous vs new behaviour; tests added and the exact command + result; example request/response for endpoint changes (no real tokens or personal data); relevant log lines; known risks and rollback.

### Bug fix

The regression test that fails before the fix and passes after it, how the bug was reproduced, the root cause, and why the fix resolves it.

### Refactor

What was refactored and why, proof external behaviour did not change (characterization tests, `TDD-Waiver: refactor ...` run against the base), and risks introduced.

### Database migration

The facts required by `docs/ai/planning.md` "Migrations": purpose, schema change, backfill, `down()` verified, compatibility with the code currently deployed, and the migration test or `Migration-Waiver:`. Remind the reviewer that the next `update-monorepo.bat` run applies it automatically.

### Performance

Measured baseline, result, method, environment, metrics, trade-offs (`docs/ai/task-router.md` `PERFORMANCE`).

### Infrastructure / deploy

The operational-verification checklist from `.ai-engineering/workflows/release.md` "Infra lane": what was dry-run, on what, and the rollback path.

## Required PR structure

```
## Resumen (Español)
<plain-language summary for a non-technical reviewer — only when the requester asks for Spanish>

## Summary (English)
<plain-language summary for a non-technical reviewer: what changes, why, what to expect>

## Change Type
- <one or more from the list above>

## Evidence
<the evidence required for this Change Type>

## Testing
- Commands executed and results
- Manual verification performed
- Important cases covered

## TDD evidence
- Test Matrix (layer | required / not required | file)
- RED run: the `npm run tdd:red` output from before implementing
- `npm run tdd:gate` output on the final head
- Waiver lines, one per line: `TDD-Waiver: <reason>`, `UI-Test-Waiver: <reason>`, `Migration-Waiver: <reason>`

## Risk
- Possible regressions · backward-compatibility · data impact · security impact · gate-access invariants touched

## Rollback
- Exact steps to revert safely
```

## Mandatory rules

- No recording for a backend-only change with no user-visible behaviour.
- Never claim a test passed without running it; never replace an automatable test with a recording.
- Never include secrets, tokens, hostnames, or student/employee personal data — this repository is public.
- If required evidence cannot be produced, open the PR as a draft (`gh pr create --draft`) and state the exact blocker.
