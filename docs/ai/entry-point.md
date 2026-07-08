# AI Entry Point

Start here before any task. This repo runs a **single-agent model**: Claude routes, investigates, plans, implements, and validates in one lane. There is no separate implementer agent and no `.ai-scratchpad.md` handoff.

## Developer Workflow

1. **Handle this task**: paste raw details or a question, no need to name the task type
2. **Claude routes**: loads `task-router.md`, classifies intent, outputs the Task Classification block
3. **Claude analyzes**: RCA, discovery, planning, or read-only findings per the matched template
4. **Claude stops for approval**: RCA (bugs), Feature Discovery + Plan, Deep task plans all require explicit approval before implementation
5. **Developer approves**: explicit go-ahead for RCA conclusions, the plan, and (for Deep tasks) implementation
6. **Claude implements**: one step at a time, in the same thread, per the Communication Style and Plan Execution Protocol in `CLAUDE.md` — TDD (failing test first), then code
7. **Claude validates**: runs verification commands, then the Post-Implementation QA Gate (`/qa` for FE+BE changes, or the five-bucket unit test sweep for backend-only changes)
8. **Done**: summary, updated `docs/ai/*` entries, rollback notes if relevant

No need to name task type or workflow — Claude handles routing.

## Load Order (Read-Only Context Discovery)

Before broad search:

1. `docs/ai/task-router.md` - task classification
2. `docs/ai/module-ownership-map.md` - domain lookup
3. `docs/ai/contracts/api-contracts.md` - API contract check
4. `docs/ai/contracts/db-contracts.md` - DB contract check
5. `docs/ai/testing-strategy.md` - verification expectations
6. `docs/ai/risk-register.md` - Deep task classification
7. `docs/ai/architecture-manifest.md` - system structure
8. `docs/ai/file-index/repository-map.md` - file locations
9. Related tests
10. Target source files

## Context Engineering Rule

Navigation docs are maps only, not proof.

- Look up domain in module-ownership-map.md
- Look up API contract in api-contracts.md
- Look up DB contract in db-contracts.md
- Look up verification in testing-strategy.md
- Look up risk in risk-register.md

Then verify all conclusions against real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.

If context docs conflict with source code → source code wins, mark `CONTEXT DRIFT`.
If contract docs conflict with source code → source code wins, mark `CONTRACT DRIFT`.
If domain is missing → mark `UNMAPPED DOMAIN`.
If contract is missing → mark `UNMAPPED CONTRACT`.
If risk area is missing → mark `UNMAPPED RISK`.

## Source of Truth

Real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions. Not navigation docs.

## Task Router Routing

After task classification, load the matching detailed prompt template:

- **Bug / error / regression / crash / test failure** → `docs/ai/prompts/bugfix-rca.md`
- **Approved RCA → implementation plan** → `docs/ai/prompts/bugfix-plan.md`
- **New feature / enhancement** → `docs/ai/prompts/feature-plan.md`
- **Refactor / cleanup** → `docs/ai/prompts/refactor-plan.md`
- **Question / code review / read-only** → no template, evidence-backed findings only

## Context Refresh

When context docs become stale, use `docs/ai/context-refresh.md` to refresh navigation and contract docs without changing source code. Mark drift with `CONTEXT DRIFT` or `CONTRACT DRIFT`. Use source code as truth in the meantime.

## Risk Classification

Tasks touching these areas default to Deep (see `docs/ai/risk-register.md` for the full, project-specific list):

- Auth / roles / permissions / JWT / session handling
- `database-sync` (external SQL Server + BioStar physical access-control integration)
- `reports` (gate entry/exit access-control event log)
- `admin` / `super-admin` / `users` account management (privilege boundaries)
- Database schema / migrations / TypeORM entities
- Production-critical gate/access-control workflows

Only downgrade Deep if source code proves the task is isolated and low-risk.

## Implementation (Single-Agent)

After plan approval, Claude implements directly in the same thread:

- Follow the exact files and changes from the approved plan
- TDD: write the failing test first, confirm it fails, implement until it passes (see Testing Requirement in `CLAUDE.md`)
- One step at a time, explaining what was built, why, which file, what each block does
- Update matching `docs/ai/*` entries and `docs/ai/file-index/repository-map.md` in the same change
- Run the Post-Implementation QA Gate before marking the step/plan done

For Deep tasks: `Deep implementation approved: Yes` must be explicit before implementation starts.

## Manual Approval Gates

- **RCA** (bug tasks): human approval required before planning
- **Plan** (all non-tiny tasks): human approval recommended before implementation
- **Deep implementation**: human approval required before any source edit

Do not begin implementation until required approval is explicit.
