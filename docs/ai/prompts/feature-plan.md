# Template: Feature Plan

> Purpose: plan a new capability or enhancement end to end.
> When to use: new capability, enhancement, new UI, or new endpoint (`docs/ai/task-router.md`).
> Deterministic rule: expand this plan per `docs/ai/planning.md` using the skeleton in `docs/ai/plan-template.md`.

Open with a TL;DR led by an analogy. Fill every section:

## Feature Discovery
Existing modules, services, guards, hooks, components and helpers to reuse — found with Graphify first (`docs/ai/planning.md` "Mandatory Graphify phase"). Examples to check: `studentMutationLock`, the token blacklist, `RolesGuard` + `@Roles`, the Redis `HttpCacheInterceptor`, `src/lib/access-status.ts`, `src/components/ui`. Note what already exists so nothing is duplicated.

## Data / Contract Changes
Entity/migration changes (Round 0, `database-architect`; the migration danger gate in `docs/ai/plan-template.md` "Lane additions"), DTOs, endpoints, socket events. Anything unverified → `UNVERIFIED DEPENDENCY`, stop.

## Persona Rounds
Per `docs/ai/agent-orchestration.md` "Round Structure".

## Files To Create / Change
Exact paths, with owners from the File Ownership Rule.

## Tests First
The Test Matrix: Jest specs, Vitest tests (a `*.test.tsx` for every changed `.tsx`), migration test, e2e where `database-sync` behaviour changes — cases `error:` > `edge:` > `regression:` > `happy:`.

## Steps
Ordered literal old/new blocks.

## Verification
Real commands (`docs/ai/execution.md` "QA mode") and `npm run tdd:gate`.

## QA Gate
`/qa` when both apps change; the five-bucket sweep for backend-only. Mandatory for Standard and Deep.

## docs/ai Sync
Which `docs/ai/*` maps and `file-index/repository-map.md` rows change in this same change.
