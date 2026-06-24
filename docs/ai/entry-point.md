# AI Entry Point

Start here before any task.

## Developer Workflow

Simple, natural task flow:

1. **Handle this task**: Paste raw details or question
2. **Claude routes**: Loads task-router.md, classifies intent, outputs Task Classification block
3. **Claude analyzes**: Per template (RCA, discovery, planning, or read-only)
4. **Claude stops for approval**: If RCA/discovery/plan requires it (esp. Deep tasks)
5. **Developer approves**: Explicit approval for RCA, plan, Deep implementation
6. **Claude handoff**: Writes .ai-scratchpad.md with Status: IMPLEMENTATION_READY
7. **Codex implements**: Reads .ai-scratchpad.md, edits source, validates
8. **Done**: Summary and rollback path

No need to name task type. No need to name workflow. Claude handles routing.

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

If context docs conflict with source code → source code wins.

If context docs are stale → mark `CONTEXT DRIFT`.

If domain is missing → mark `UNMAPPED DOMAIN`.

## Contract Engineering Rule

Contract maps and risk maps are navigation aids only, not proof.

- Use docs to find likely areas
- Verify all contract conclusions against source code, tests, types, schemas, routes, controllers, services
- If contract docs conflict with source code → source code wins
- If contract docs are stale → mark `CONTRACT DRIFT`
- If contract is missing → mark `UNMAPPED CONTRACT`
- If risk area is missing → mark `UNMAPPED RISK`

## Source of Truth

Real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.

Not navigation docs.

## Task Router Routing

After task classification, load detailed prompt templates:

- **Bug / error / regression / crash / test failure** → `docs/ai/prompts/bugfix-rca.md`
- **Approved RCA → implementation plan** → `docs/ai/prompts/bugfix-plan.md`
- **New feature / enhancement** → `docs/ai/prompts/feature-plan.md`
- **Refactor / cleanup** → `docs/ai/prompts/refactor-plan.md`
- **Question / code review / read-only** → no template, findings only

## Context Refresh

When context docs become stale:

Use `docs/ai/context-refresh.md` to refresh navigation and contract docs without changing source code.

Mark drift with `CONTEXT DRIFT` or `CONTRACT DRIFT`.

Use source code as truth.

## Risk Classification

Tasks touching these areas default to Deep:

- Billing / Payments / SMS Credits
- Plan Upgrades
- Auth / Roles / Permissions
- Automations / Jobs / Webhooks
- Database schema / migrations / transactions
- Production-critical workflows

Only downgrade Deep if source code proves task is isolated and low-risk.

## Implementation Handoff

After plan approval, Claude writes `.ai-scratchpad.md` with:

- Status: IMPLEMENTATION_READY (not before approval)
- Exact files to modify
- Exact changes per file
- Contract impact
- Verification commands
- Manual QA steps
- Rollback notes

For Deep tasks: `Deep implementation approved: Yes` required.

## Codex Implementation

Codex reads `.ai-scratchpad.md` and implements only when Status is IMPLEMENTATION_READY.

No RCA by Codex. No re-planning. No inferred details.

After implementation:

- Run verification commands from scratchpad
- Check git diff against Files To Modify
- Update scratchpad to VALIDATION_READY

## Manual Approval Gates

- **RCA** (bug tasks): Human approval required before planning
- **Plan** (all non-tiny tasks): Human approval recommended before Codex implementation
- **Deep implementation**: Human approval required before Codex touches source

Do not write Status: IMPLEMENTATION_READY until human approval is explicit.
