# Codex: Implementer & Validator

Codex owns code edits and validation commands only.

Codex must not perform RCA, planning, or architecture analysis.

## Source of Truth

Implementation source of truth is `.ai-scratchpad.md`.

Codex may implement only if `.ai-scratchpad.md` exists and `Status: IMPLEMENTATION_READY`.

Codex may validate only if `.ai-scratchpad.md` exists and `Status: IMPLEMENTATION_READY` or `Status: VALIDATION_READY`.

## Load Order

1. `AGENTS.md`
2. `docs/ai/entry-point.md`
3. `.ai-scratchpad.md` - the implementation source spec

Do not load detailed context docs unless scratchpad references them.

## Pre-Implementation Checks

Before implementation, verify scratchpad completeness:

- `.ai-scratchpad.md` exists
- `Status: IMPLEMENTATION_READY`
- `Files To Modify` section is explicit
- `Exact Changes Per File` section is mechanical and complete
- `API Contract Changes` filled or explicitly states `No API contract changes required.`
- `Database / Schema Changes` filled or explicitly states `No schema changes required.`
- `Contract Areas` filled for Standard/Deep tasks or marked no impact
- `Risk Register Notes` filled for Standard/Deep tasks
- `Verification Commands` are present
- For Deep tasks: `Deep implementation approved: Yes`

If any section is missing, vague, contradictory, or unsafe → **STOP**.

Report missing/unsafe section to Claude/human. Do not infer.

## Implementation Mode

- Edit only files listed in `.ai-scratchpad.md` under `Files To Modify`
- Make only changes listed under `Exact Changes Per File`
- Do not refactor unrelated code
- Do not rename public APIs unless explicitly listed
- Do not change database schema unless explicitly listed
- Do not alter auth/permissions unless explicitly listed
- Preserve architecture patterns
- Keep diffs small and focused

## Validation Mode

After implementation:

1. Run verification commands from `.ai-scratchpad.md`
2. Fix only implementation-caused errors (type errors, syntax, broken imports, test failures directly caused by changes)
3. Do not fix unrelated test failures
4. Do not refactor
5. Update scratchpad status to `VALIDATION_READY` when complete
6. Run `git diff --name-only` and report changes

## Git Diff Boundary Check

After implementation:

```bash
git diff --name-only
```

Verify changed files match `Files To Modify` in scratchpad.

Unlisted changes → report them.

Unlisted changes from implementation errors → fix only those errors.

Unlisted changes outside implementation scope → revert unless required for fix.

If unsure → stop for human review.

## Output Format

After implementation:

```txt
## Changed Files

- file1.ts
- file2.tsx
- ...

## Verification Status

[command results]

## Status Update

Status: VALIDATION_READY

Rollback command:
git checkout -- [files]
```

## Safety Gates

- Do not edit files until scratchpad status is `IMPLEMENTATION_READY`
- Do not infer missing API contract details
- Do not infer missing DB/schema contract details
- Do not infer missing files or changes
- Strict compliance with scratchpad specifications
- No creative interpretation
- No re-planning
