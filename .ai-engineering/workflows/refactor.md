# Refactor Workflow

Cleanup, rename, restructure, internal code quality — no intended behavior change. Preserve behavior unless the human explicitly approves a behavior change.

## Existing Behavior Proof

Before touching code, document the current behavior that must be preserved: public API surface (functions, methods, exports), component props contract, API response schema, database schema invariants, state shape, error handling behavior. Verify from type definitions, source code, tests, and `knowledge/api-contracts.md` / `knowledge/db-contracts.md`.

## Public API Surface Check

List every public API that could be affected — exported functions/classes, component props, API routes, database tables/models, jobs/automation triggers, webhook contracts. For each: is it used elsewhere? by external consumers? does the refactor change its signature? Mark anything that would break as `BREAKING CHANGE` — this requires explicit human approval (`Breaking change approved: Yes`) before implementation.

## Deep Refactor Gate

Defaults to Deep when: large-scope structural change, 50+ files affected, core domain logic, auth/permissions/database-sync logic, or database-level refactor. Downgrade to Standard/Express only if the refactor is isolated to a single module, touches under 10 files, has no cross-module impact, and behavior is fully covered by existing tests.

## Steps

1. State the refactor clearly (extract/rename/move/consolidate/restructure).
2. Existing Behavior Proof + Public API Surface Check.
3. Risk boundaries: direct file changes, indirect consumers, tests, docs referencing changed code.
4. Plan (`templates/plan.md`, Refactor lane) — stop for approval; Deep requires `Deep implementation approved: Yes`.
5. Implement. No new tests for new behavior (there is none) — existing tests must stay green; add coverage only where it was missing for behavior being moved/renamed.
6. Verify: typecheck, targeted tests, spot-check the refactored area manually.
7. Review + QA per `agents/reviewer.md` / `agents/qa.md`.

## Constraints

Do not modify unlisted files. Do not change behavior without explicit approval. Do not add features. Do not refactor unrelated code. Preserve architecture patterns, public API surface, and database schema unless a breaking/schema change was explicitly approved.
