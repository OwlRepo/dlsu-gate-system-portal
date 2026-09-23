# Template: Bugfix Plan

> Purpose: turn an approved RCA into a concrete, testable fix.
> When to use: after `docs/ai/prompts/bugfix-rca.md` is approved.
> Deterministic rule: expand this plan per `docs/ai/planning.md` using the skeleton in `docs/ai/plan-template.md`; every path, symbol, operation, test and regression risk is explicit.

Open with a TL;DR led by an analogy. Fill every section:

## Issue Selected
The issue this plan fixes (Linear ID if any).

## Root Cause Recap
One or two lines from the approved RCA, with its evidence.

## Files To Change
Exact paths and symbols.

## Failing Test First
The regression test written first that fails because of the bug: exact file (`apps/backend/src/**/*.spec.ts` or `apps/portal-web/src/**/*.test.tsx`), case title (`regression: ...`), and assertion. It must be seen failing with `npm run tdd:red` before any fix.

## Implementation Steps
Ordered, minimal literal old/new blocks that make the test pass without unrelated changes.

## Verification
Real commands (`docs/ai/execution.md` "QA mode"), `npm run tdd:gate`, plus `/qa` when both apps are involved or the five-bucket sweep for backend-only fixes.

## Rollback / Risk
How to revert, and residual risk — especially for the gate-access invariants, auth, `database-sync` and migrations.
