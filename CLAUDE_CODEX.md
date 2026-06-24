# CLAUDE_CODEX.md

Goal: split-brain bootstrap source spec for Claude + Codex. Claude routes, investigates, plans, writes handoff. Codex implements, validates, guards diff. Keep truth. Kill drift.

## Bootstrap Source Contract

`CLAUDE_CODEX.md` is bootstrap source spec.

When used to set up project, it generates or updates project AI environment.

Generated project files must follow this spec.

Generated project files must not contradict this spec.

Do not treat `CLAUDE_CODEX.md` as generated project file.

Primary task when this file is used as instruction source: update `CLAUDE_CODEX.md` first unless user explicitly asks to bootstrap generated outputs.

Bootstrap outputs:

- `CLAUDE.md`
- `AGENTS.md`
- `.codex/instructions.md`
- `.ai-scratchpad.md`
- `.claude/settings.json` or `.claude/settings.example.json`
- `docs/ai/entry-point.md`
- `docs/ai/task-router.md`
- `docs/ai/architecture-manifest.md`
- `docs/ai/module-ownership-map.md`
- `docs/ai/contracts/api-contracts.md`
- `docs/ai/contracts/db-contracts.md`
- `docs/ai/testing-strategy.md`
- `docs/ai/risk-register.md`
- `docs/ai/context-refresh.md`
- `docs/ai/file-index/repository-map.md`
- `docs/ai/prompts/bugfix-rca.md`
- `docs/ai/prompts/bugfix-plan.md`
- `docs/ai/prompts/feature-plan.md`
- `docs/ai/prompts/refactor-plan.md`

## Caveman Rule

- Use short blunt docs.
- Keep code, paths, commands, API names, error strings exact.
- No fluff. No hedging.
- Stop caveman style only if user says `normal mode` or `stop caveman`.

## Split-Brain Rule

Claude owns:

- task routing
- RCA
- code discovery
- architecture analysis
- feature discovery
- implementation planning
- `.ai-scratchpad.md` handoff

Codex owns:

- code edits
- mechanical implementation
- validation commands
- implementation-caused syntax/type/test fixes
- diff boundary enforcement

Claude must not do Codex work.

Claude must not edit source code.

Codex must not do Claude work.

Codex must not perform RCA.

## Tree Framework

- `CLAUDE_CODEX.md` -> bootstrap source spec
- `CLAUDE.md` -> generated router/planner/handoff contract for Claude Code
- `AGENTS.md` -> generated loader pointer
- `.claude/settings.json` or `.claude/settings.example.json` -> generated Claude Code permission intent; read/discovery allowed, source writes denied when supported by installed Claude Code schema
- `.codex/instructions.md` -> generated implementor/validator contract
- `.ai-scratchpad.md` -> generated temporary status-gated mechanical handoff shell
- `docs/ai/entry-point.md` -> generated workflow summary and load order
- `docs/ai/task-router.md` -> generated task classification and workflow router
- `docs/ai/architecture-manifest.md` -> generated architecture map only
- `docs/ai/module-ownership-map.md` -> generated business/domain ownership map only
- `docs/ai/contracts/api-contracts.md` -> generated API contract map only
- `docs/ai/contracts/db-contracts.md` -> generated database/model invariant map only
- `docs/ai/testing-strategy.md` -> generated verification strategy map only
- `docs/ai/risk-register.md` -> generated high-risk area map only
- `docs/ai/context-refresh.md` -> generated context refresh workflow
- `docs/ai/file-index/repository-map.md` -> generated repository map only
- `docs/ai/prompts/bugfix-rca.md` -> generated detailed bug RCA template
- `docs/ai/prompts/bugfix-plan.md` -> generated detailed RCA-backed implementation plan template
- `docs/ai/prompts/feature-plan.md` -> generated detailed feature discovery + implementation plan template
- `docs/ai/prompts/refactor-plan.md` -> generated detailed behavior-preserving refactor plan template

Domain maps are navigation aids only. They are not proof.

Contract maps and risk maps are navigation aids only. They are not proof.

Final conclusions must still be verified against source code, tests, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.

## Developer Workflow Contract

Generated setup must let developer use simple natural prompts.

Developer-natural workflow remains:

- Handle this task: [raw details]
- Approved. Create implementation handoff.
- Implement from `.ai-scratchpad.md`.
- Validate from `.ai-scratchpad.md`.

Developer should only need:

```txt
Handle this task:

[paste details]
```

After Claude RCA/discovery/plan is approved:

```txt
Approved. Create implementation handoff.
```

For Codex implementation:

```txt
Implement from `.ai-scratchpad.md`.
```

For Codex validation:

```txt
Validate from `.ai-scratchpad.md`.
```

Developer must not need to name internal lanes.

Claude must auto-route raw task details through `docs/ai/task-router.md`.

Codex must only implement or validate from `.ai-scratchpad.md`.

## Context Engineering Contract

Generated setup must help Claude locate relevant code quickly without treating docs as truth.

Context files:

- `docs/ai/entry-point.md` -> load order and workflow entry
- `docs/ai/task-router.md` -> task classification and template routing
- `docs/ai/architecture-manifest.md` -> architecture map
- `docs/ai/module-ownership-map.md` -> business/domain ownership map
- `docs/ai/file-index/repository-map.md` -> file ledger
- `docs/ai/prompts/*` -> workflow templates
- `.ai-scratchpad.md` -> task handoff contract for Codex

Rules:

- Context docs are maps only.
- Context docs are not proof.
- Use context docs to find likely files.
- Verify all conclusions against real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.
- If context docs conflict with source code, source code wins.
- If context docs are stale, mark `CONTEXT DRIFT`.
- If domain is missing from map, mark `UNMAPPED DOMAIN`.

## Contract Engineering Contract

Generated setup must help Claude identify and verify system contracts before planning implementation.

Contract context files:

- `docs/ai/contracts/api-contracts.md` -> frontend/backend API contract map
- `docs/ai/contracts/db-contracts.md` -> database/model invariant map
- `docs/ai/testing-strategy.md` -> verification expectations by task type and risk
- `docs/ai/risk-register.md` -> high-risk area map
- `docs/ai/context-refresh.md` -> workflow for refreshing stale context docs

Rules:

- Contract docs are maps only.
- Contract docs are not proof.
- Use contract docs to find likely API, DB, test, and risk areas.
- Verify contract conclusions against real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.
- If contract docs conflict with source code, source code wins.
- If contract docs are stale, mark `CONTRACT DRIFT`.
- If required contract is missing, mark `UNMAPPED CONTRACT`.
- Do not convert unverified contract assumptions into implementation steps.

## Contract Drift Rule

When verified source code contradicts API contract maps, DB contract maps, testing strategy, or risk register:

- mark `CONTRACT DRIFT`
- report stale file and section
- use source code as truth for current task
- do not rewrite contract docs unless user asks for context refresh

## API Contract Map Contract

Generated `docs/ai/contracts/api-contracts.md` maps important frontend-backend contracts.

Purpose:

Help Claude locate and verify API request/response contracts before RCA, feature planning, or implementation handoff.

This file is map only.

It is not proof of behavior.

Required columns:

| Domain | Feature | Method | Endpoint / Route | Frontend Caller | Backend Handler | Request Shape | Response Shape | Auth / Permission | Risk | Notes |
| ------ | ------- | ------ | ---------------- | --------------- | --------------- | ------------- | -------------- | ----------------- | ---- | ----- |

Rules:

- Use this map before FE-BE contract checks.
- Verify all API contracts against source code before conclusions.
- If frontend expectation and backend response differ, mark `CONTRACT MISMATCH`.
- If map conflicts with source code, mark `CONTRACT DRIFT`.
- If contract is missing from map, mark `UNMAPPED CONTRACT`.
- Do not invent request or response shapes.
- Unknown fields must be marked `TODO: Fill after repository analysis. Do not treat as verified.`

## Database Contract Map Contract

Generated `docs/ai/contracts/db-contracts.md` maps important database models, ownership, and invariants.

Purpose:

Help Claude locate and verify database/model constraints before planning schema-sensitive work.

This file is map only.

It is not proof of behavior.

Required columns:

| Domain | Model / Table | Owner Module | Important Fields | Invariants | Mutation Paths | Transaction / Idempotency Rules | Related APIs / Jobs | Risk | Notes |
| ------ | ------------- | ------------ | ---------------- | ---------- | -------------- | ------------------------------- | ------------------- | ---- | ----- |

Rules:

- Use this map before schema, billing, payment, SMS credit, automation, job, webhook, or transaction planning.
- Verify all DB contracts against schema, migrations, services, jobs, and tests.
- If mutation path bypasses required invariant, mark `CONTRACT MISMATCH`.
- If map conflicts with source code, mark `CONTRACT DRIFT`.
- If contract is missing from map, mark `UNMAPPED CONTRACT`.
- Do not invent invariants.
- Unknown fields must be marked `TODO: Fill after repository analysis. Do not treat as verified.`

## Testing Strategy Contract

Generated `docs/ai/testing-strategy.md` maps task size and risk to expected verification.

Purpose:

Help Claude propose appropriate verification commands and manual QA without inventing package scripts.

This file is map only.

Commands must be verified from package scripts or repo docs before being listed as valid.

Required table:

| Task Size | Minimum Verification                                                   | Extra Verification                                            | Manual QA           | Notes                                          |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------- | ---------------------------------------------- |
| Tiny      | targeted read-through or formatting check                              | none                                                          | visual/read-through | no behavior change                             |
| Express   | targeted type/lint/test if available                                   | related test if available                                     | focused flow        | single-layer change                            |
| Standard  | verified type/lint/test/build commands if available + related tests    | regression test when relevant                                 | affected workflow   | FE-BE or multi-file changes                    |
| Deep      | verified type/lint/test/build commands if available + regression tests | migration/payment/job/webhook/permission checks when relevant | full critical flow  | billing/payments/auth/jobs/schema/transactions |

Rules:

- Claude must discover commands from package scripts or repo docs.
- Default command candidates may be mentioned but not claimed as valid unless verified.
- If verification cannot run due to environment/config, mark blocker.
- Deep tasks require rollback/risk notes and manual QA.

## Risk Register Contract

Generated `docs/ai/risk-register.md` maps high-risk project areas.

Purpose:

Help Claude classify risky work as Deep and plan safer verification.

This file is map only.

It is not proof of behavior.

Required columns:

| Risk Area | Why Risky | Default Task Size | Required Checks | Manual QA | Notes |
| --------- | --------- | ----------------- | --------------- | --------- | ----- |

Starter risk areas:

- Billing
- Payments
- SMS Credits
- Plan Upgrades
- Auth / Permissions
- Automations
- Jobs
- Webhooks
- Database Migrations
- Transactions
- External Integrations
- Production Deployment

Rules:

- If task touches listed high-risk area, default to Deep.
- Only downgrade Deep if repository evidence proves task is isolated and low-risk.
- Verify risk against source code and related contracts.
- If risk area is missing, mark `UNMAPPED RISK`.

## Context Refresh Rule

Context docs can become stale.

When Claude discovers verified source-code facts that contradict generated context docs:

- mark `CONTEXT DRIFT`
- mark `CONTRACT DRIFT` when API/DB/test/risk contract docs are stale
- report stale file and section
- do not update context docs unless user asks
- use source code as truth for current task

When user asks to refresh context:

- use `docs/ai/context-refresh.md`
- update only context docs
- do not edit source files
- verify facts against source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions
- update architecture manifest, module ownership map, repository map, API contracts, DB contracts, testing strategy, and risk register from verified evidence
- do not invent missing areas
- mark unknowns as `TODO: Fill after repository analysis. Do not treat as verified.`

## Context Refresh File Contract

Generated `docs/ai/context-refresh.md` defines how Claude refreshes AI context docs.

Purpose:

Refresh AI navigation and contract docs without changing source code.

Required sections:

1. Scope
2. Files To Refresh
3. Source Verification Rules
4. Drift Markers
5. Refresh Steps
6. Output Summary

Rules:

- context refresh is read-only for source code
- only context docs may be edited
- no source code changes
- no implementation planning
- no feature work
- all facts must be verified from source code or repo docs
- stale entries must be marked `CONTEXT DRIFT` or `CONTRACT DRIFT`
- missing areas must be marked `TODO: Fill after repository analysis. Do not treat as verified.`

## Module Ownership Map Contract

Generated `docs/ai/module-ownership-map.md` maps product/business domains to implementation areas.

Purpose:

Help Claude locate relevant code by domain before broad search.

This file is map only.

It is not proof of behavior.

Required columns:

| Domain | Frontend | Backend | Database / Schema | Jobs / Automations | Integrations | Tests | Risk | Notes |
| ------ | -------- | ------- | ----------------- | ------------------ | ------------ | ----- | ---- | ----- |

Required starter domains:

- Billing Requests
- Payments
- SMS Credits
- Plan Upgrades
- Auth / Permissions
- Customers
- Appointments
- Intake / Booking
- Automations
- Messaging
- Imports
- Insights / Analytics
- Platform Admin
- Settings / Onboarding

Risk values:

- Tiny
- Express
- Standard
- Deep

Default Deep domains:

- Billing Requests
- Payments
- SMS Credits
- Plan Upgrades
- Auth / Permissions
- Automations
- Messaging webhooks
- Database migrations
- Transactions

If implementation areas are unknown, use:

`TODO: Fill after repository analysis. Do not treat as verified.`

Claude must use this map before broad search when task references business/domain area.

Claude must still verify all domain conclusions against real source code.

## Context Order

Before broad search:

1. `docs/ai/task-router.md`
2. `docs/ai/architecture-manifest.md`
3. `docs/ai/module-ownership-map.md`
4. `docs/ai/contracts/api-contracts.md`
5. `docs/ai/contracts/db-contracts.md`
6. `docs/ai/testing-strategy.md`
7. `docs/ai/risk-register.md`
8. `docs/ai/file-index/repository-map.md`
9. related test suites
10. target source files

Navigation files are maps only. They are not proof.

Final conclusions must be verified against actual source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.

Source of truth is real source code/tests/types/schemas/routes/controllers/services/stores/components/API contracts/database definitions.

## Prompt Template Routing

- Bug reports use `docs/ai/prompts/bugfix-rca.md`.
- Approved bug RCA uses `docs/ai/prompts/bugfix-plan.md`.
- New features use `docs/ai/prompts/feature-plan.md`.
- Refactors use `docs/ai/prompts/refactor-plan.md`.

`CLAUDE.md` should stay compact.

Detailed workflows belong in `docs/ai/prompts/*`.

## Task Router Contract

Generated `docs/ai/task-router.md` must classify raw user requests.

Generated `docs/ai/task-router.md` must consult `docs/ai/module-ownership-map.md` after classifying task intent.

Generated `docs/ai/task-router.md` must consult relevant context docs after classifying task intent:

- `docs/ai/module-ownership-map.md` for domain
- `docs/ai/contracts/api-contracts.md` for FE-BE contracts
- `docs/ai/contracts/db-contracts.md` for DB/model invariants
- `docs/ai/testing-strategy.md` for verification level
- `docs/ai/risk-register.md` for Deep classification

Raw task details may include:

- plain English request
- bug report
- feature request
- refactor request
- QA report
- issue tracker ticket
- GitHub issue
- Jira ticket
- Linear ticket
- error log
- stack trace
- screenshot description
- user complaint
- production incident note
- test failure output
- code review comment
- support report

Claude must not require user to name a lane.

Task router must determine:

- likely domain
- likely risk level
- likely related frontend area
- likely related backend area
- likely database/schema area
- likely tests
- whether task is Deep by default
- likely contract areas
- likely risk register notes

Claude must classify:

| Input Intent                                                                                                                          | Internal Workflow | Template                           |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------- |
| Bug, error, regression, crash, failing test, broken behavior, unexpected behavior, production incident, QA failure, support complaint | Bug RCA           | `docs/ai/prompts/bugfix-rca.md`    |
| Approved RCA, request for fix plan, request to generate implementation plan after RCA                                                 | Bug Plan          | `docs/ai/prompts/bugfix-plan.md`   |
| New capability, enhancement, new workflow, new UI behavior, new API behavior, product behavior change                                 | Feature Plan      | `docs/ai/prompts/feature-plan.md`  |
| Cleanup, rename, restructure, internal code quality change, no intended behavior change                                               | Refactor Plan     | `docs/ai/prompts/refactor-plan.md` |
| Question, explanation, code review, architecture review, discovery only                                                               | Read-only         | No scratchpad unless user asks     |

If ambiguous, choose safest workflow:

- possible bug -> Bug RCA
- possible product behavior addition -> Feature Plan
- possible no-behavior-change cleanup -> Refactor Plan
- possible billing/payments/SMS credits/auth/roles/permissions/automations/jobs/webhooks/migrations/transactions -> Deep task

If domain is missing, mark `UNMAPPED DOMAIN`.

If map entry is stale or contradicts source code, mark `CONTEXT DRIFT`.

Claude must output classification before analysis:

```txt
Task Classification:
- Intent:
- Workflow:
- Task Size:
- Domain:
- Risk:
- Contract Areas:
- Risk Register Notes:
- Template Loaded:
- Context Files Used:
- Next Action:
```

Claude must not ask user to choose workflow unless task lacks enough information to classify safely.

## Internal Workflow Routing

These workflows are internal.

Developer does not need to name them.

Claude selects workflow through `docs/ai/task-router.md`.

Codex selects implementation or validation behavior from `.codex/instructions.md` and `.ai-scratchpad.md`.

| Intent                                                   | Internal Workflow | Owner      | Output                                                         |
| -------------------------------------------------------- | ----------------- | ---------- | -------------------------------------------------------------- |
| Bug/error/regression/crash/failing test                  | Bug RCA           | Claude     | RCA first. No fix plan until RCA approved.                     |
| Approved RCA needing implementation plan                 | Bug Plan          | Claude     | Implementation Plan + `.ai-scratchpad.md`.                     |
| New feature/enhancement                                  | Feature Plan      | Claude     | Feature Discovery + Implementation Plan + `.ai-scratchpad.md`. |
| Refactor/cleanup                                         | Refactor Plan     | Claude     | Risk-scoped plan + `.ai-scratchpad.md`.                        |
| Question/code review/explanation/read-only investigation | Read-only         | Claude     | Evidence-backed findings only. No scratchpad unless user asks. |
| Implementation from approved scratchpad                  | Implement         | Codex only | Code edits only. No planning.                                  |
| Verification after implementation                        | Validate          | Codex only | Run commands. Fix only implementation-caused errors.           |

## Planner Output Modes

Claude has three output modes.

### Read-only Findings

Use when task is question, review, explanation, or discovery only.

Rules:

- no source edits
- no `.ai-scratchpad.md`
- evidence-backed findings only

### RCA / Discovery

Use for bug RCA, feature discovery, or risky investigation.

Rules:

- no implementation
- no source edits
- stop for approval when required
- do not write `.ai-scratchpad.md` unless approved for handoff

### Implementation Handoff

Use only after approval.

Rules:

- write `.ai-scratchpad.md`
- use `Status: IMPLEMENTATION_READY`
- include exact files and exact changes
- include verification commands
- include manual QA
- include rollback/risk notes when needed
- stop after handoff

## Task Size Classification

### Tiny

- docs, copy, comments, config, display-only polish
- no behavior change
- minimal verification

### Express

- single-layer change
- usually 1-2 files
- no DB/schema/API contract change
- low regression risk
- targeted verification

### Standard

- multiple files or FE-BE coordination
- moderate regression risk
- requires contract verification
- requires targeted tests

### Deep

- high-risk or production-critical workflow
- requires full RCA/discovery
- requires plan approval
- requires regression tests
- requires manual QA
- requires rollback notes

Deep includes:

- billing
- payments
- auth
- permissions
- automation
- jobs
- webhooks
- credits
- plans
- subscriptions
- database schema
- migrations
- transactions
- production-critical workflows

Deep by default:

- billing
- payments
- SMS credits
- plan upgrades
- auth
- roles
- permissions
- automations
- jobs
- webhooks
- migrations
- transactions

Only downgrade Deep if repository evidence proves task is isolated and low-risk.

## Deep Task Approval Gate

For Deep tasks:

- Claude may produce RCA/discovery first.
- Claude must stop after RCA/discovery.
- Human approval required before plan.
- Claude must not write `Status: IMPLEMENTATION_READY` until human approval is explicit.
- Human approval required before Codex implementation.
- Codex must refuse implementation if Deep task approval is not stated in `.ai-scratchpad.md`.
- Codex must refuse Deep implementation unless `.ai-scratchpad.md` includes `Deep implementation approved: Yes`.

## Bugfix RCA Contract

For bug reports, Claude must produce RCA first.

Do not generate implementation steps.

Do not write `Status: IMPLEMENTATION_READY`.

Required RCA sections:

1. Issue Selected
2. Bug Summary
3. Reproduction Flow From Code
4. FE Investigation
5. BE Investigation
6. FE vs BE Contract Check
7. Root Cause
8. Why Existing Code Allows The Bug
9. Eliminated Causes
10. Remaining Uncertainties
11. Confidence Level
12. Basic Solution Direction
13. Planning Handoff

For FE-BE bugs, contract check is mandatory.

FE-BE Contract Check must document:

- Frontend sends:
- Backend expects:
- Backend returns:
- Frontend expects:
- Mismatch:
- Evidence:

Planning Handoff must include:

- Confirmed Root Cause
- Owning Layer
- Primary Affected Files
- Secondary Affected Files
- Confirmed Contract Details
- Files / Causes Ruled Out
- Required Verification Commands
- Planning Constraints

## Bugfix Implementation Plan Contract

After RCA approval, Claude may generate bugfix implementation plan.

Every plan step must map to verified RCA facts.

Do not redo RCA unless required to verify implementation detail.

Required sections:

1. Plan Overview & Scope
2. Database & Schema Changes
3. Backend Implementation Steps
4. Frontend Implementation Steps
5. Implementation Verification & Testing Plan
6. Rollback / Risk Mitigation Plan
7. Codex Scratchpad Output

For FE-BE bugfix plans, include:

- Frontend sends:
- Backend expects:
- Backend returns:
- Frontend expects:
- Contract change:
- Compatibility risk:

Final Codex Scratchpad Output must be written to `.ai-scratchpad.md`.

`.ai-scratchpad.md` may use `Status: IMPLEMENTATION_READY` only after approval.

## Feature Planning Contract

For new features, do not use RCA.

Use Feature Discovery.

Feature planning answers: where does this fit in existing system?

Feature plan must determine:

1. Whether feature already partially exists
2. Existing similar patterns to reuse
3. Ownership boundaries
4. Data flow
5. API contract impact
6. Database/schema impact
7. Permission impact
8. Validation impact
9. State/cache impact
10. Regression surface

For FE-BE features, include:

- Frontend will send:
- Backend should expect:
- Backend should return:
- Frontend should consume:
- Compatibility risk:

Required sections:

1. Feature Selected
2. Existing System Discovery
3. Current Data / Control Flow
4. Feature Gap Analysis
5. API Contract Plan
6. Database & Schema Changes
7. Backend Implementation Steps
8. Frontend Implementation Steps
9. External Integration / Background Job Steps
10. Implementation Sequence
11. Verification & Testing Plan
12. Rollback / Risk Mitigation Plan
13. Codex Scratchpad Output

Final Codex Scratchpad Output must be written to `.ai-scratchpad.md`.

`.ai-scratchpad.md` may use `Status: IMPLEMENTATION_READY` only after approval.

## Refactor Planning Contract

For refactors, preserve behavior unless user explicitly approved behavior change.

Refactor planning must determine:

1. Current behavior to preserve
2. Public API surface at risk
3. Dependency boundaries
4. Migration or rollout risk
5. Regression surface
6. Validation scope

Required sections:

1. Refactor Selected
2. Existing Behavior Proof
3. Public API Surface Check
4. Risk Boundaries
5. Implementation Steps
6. Verification & Testing Plan
7. Rollback / Risk Mitigation Plan
8. Codex Scratchpad Output

Must forbid broad cleanup and opportunistic changes.

`.ai-scratchpad.md` may use `Status: IMPLEMENTATION_READY` only after approval.

## Migration Danger Gate

If schema changes are involved, answer before implementation planning:

- Migration required?
- Backfill required?
- Default/nullability?
- Index or constraint impact?
- Existing data impact?
- Rollback possible?
- Deployment ordering risk?

If any answer is unknown, mark `UNVERIFIED DEPENDENCY`.

Do not proceed to implementation until resolved.

## `.ai-scratchpad.md` Contract

Required statuses:

- `EMPTY`
- `RCA_READY`
- `DISCOVERY_READY`
- `PLAN_READY`
- `IMPLEMENTATION_READY`
- `VALIDATION_READY`
- `BLOCKED`

Codex may implement only if `Status: IMPLEMENTATION_READY`.

Codex may validate only if `Status: IMPLEMENTATION_READY` or `Status: VALIDATION_READY`.

Required format:

```md
# AI SCRATCHPAD

Status: EMPTY / RCA_READY / DISCOVERY_READY / PLAN_READY / IMPLEMENTATION_READY / VALIDATION_READY / BLOCKED

Claude writes here.

Codex implements from here only when Status is `IMPLEMENTATION_READY`.

Codex validates from here only when Status is `IMPLEMENTATION_READY` or `VALIDATION_READY`.

Do not store long-term project docs here.

---

## Task Summary

## Task Type

Bugfix / Feature / Refactor / Validation

## Task Size

Tiny / Express / Standard / Deep

## Human Approval

- RCA approved:
- Discovery approved:
- Plan approved:
- Deep implementation approved:

## Confirmed Facts

## Files To Modify

### File: `path/to/file`

- Location:
- Change:
- Reason:
- Contract impact:
- Test impact:

## Exact Changes Per File

## API Contract Changes

State `No API contract changes required.` if none.

## Database / Schema Changes

State `No schema changes required.` if none.

## Contract Areas

- API:
- Database:
- Permissions:
- External integrations:
- Jobs / automations:

## Risk Register Notes

## Guardrails

- Do not modify unlisted files.
- Do not refactor unrelated code.
- Do not rename public APIs unless explicitly listed.
- Do not change database schema unless explicitly listed.
- Do not alter auth/permissions unless explicitly listed.
- Do not infer missing details.

## Implementation Order

## Verification Commands

## Manual Verification Flow

## Rollback / Risk Notes

## Done Criteria
```

Codex must be able to implement from this file with zero creative interpretation.

## Scratchpad Completeness Gate

Before Codex implementation:

- `.ai-scratchpad.md` must exist.
- `Status` must be `IMPLEMENTATION_READY`.
- All required sections must be present.
- Human approval fields must be filled when required.
- For Deep tasks, `Deep implementation approved` must be `Yes`.
- Contract Areas must be filled or explicitly marked `No contract impact`.
- Risk Register Notes must be filled for Standard and Deep tasks.
- API Contract Changes must be filled or explicitly state `No API contract changes required.`
- Database / Schema Changes must be filled or explicitly state `No schema changes required.`
- Files To Modify must be explicit.
- Exact Changes Per File must be mechanical.
- Verification Commands must come from package scripts or repo docs.

Before Codex validation:

- `.ai-scratchpad.md` must exist.
- `Status` must be `IMPLEMENTATION_READY` or `VALIDATION_READY`.
- Verification Commands must be present.
- Changed files must be checked against Files To Modify.

If missing, vague, contradictory, or unsafe:

- Codex stops.
- Codex does not infer.
- Codex reports missing or unsafe section.
- Claude/human must fix scratchpad before implementation or validation.

## Safety & Gates

- No speculative architecture.
- No unrelated refactors.
- No new dependency without human approval.
- Source of truth = real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.
- Source of truth is real source code/tests/types/schemas/routes/controllers/services/stores/components/API contracts/database definitions.
- Navigation docs never count as proof.
- Claude discovers commands from package scripts or repo docs before listing them.
- Default command candidates may be mentioned, but never claimed as repo-valid unless verified.
- Validation fixes limited to implementation-caused errors.
- If blocked by env/config outside implementation scope, stop and report exact blocker.

### Git Diff Boundary Check

- Codex must run `git diff --name-only` after implementation.
- Changed files must match `.ai-scratchpad.md`.
- Unlisted changes must be reported.
- Unlisted changes must be reverted unless required for implementation-caused compile/test fixes.
- If unsure, stop for human review.
- Codex must not infer missing scratchpad details.
- Codex must not re-plan.

## Bootstrap Command Contract

This section controls interaction flow before file writes.

When user asks to bootstrap project using this file, Codex must:

1. Treat `CLAUDE_CODEX.md` as source spec.
2. Inspect target project tree.
3. Detect existing AI setup files.
4. Produce bootstrap plan first.
5. List files to create, update, skip, or preserve.
6. Wait for human approval before writing files unless user explicitly requested direct setup.
7. Generate/update only approved bootstrap output files.
8. Preserve project-specific content.
9. Report final output summary.

If user explicitly says `apply directly`, Codex may skip approval after producing concise plan.

## Bootstrap Execution Rules

This section controls file generation and update behavior.

When Codex uses this file to bootstrap target project:

1. Read `CLAUDE_CODEX.md` first.
2. Inspect target project tree.
3. Detect existing AI setup files.
4. Preserve useful existing content.
5. Generate missing files from this spec.
6. Update outdated generated files to match this spec.
7. Do not overwrite project-specific docs blindly.
8. Do not create active `.claude/settings.json` unless schema support is verified.
9. If Claude Code settings schema is not verified, create `.claude/settings.example.json` instead.
10. Do not invent package scripts.
11. Verification commands must come from package scripts or repo docs.
12. Output changed files and skipped files with reasons.

## Bootstrap Output Summary

After bootstrap, Codex must report:

1. Files created
2. Files updated
3. Files skipped
4. Existing content preserved
5. Config uncertainty
6. Verification performed
7. Manual follow-up required

## Generated File Drift Rule

If generated setup files already exist:

- compare them against this spec
- preserve project-specific additions
- update stale rules
- do not remove useful local conventions
- report drift found
- report what was changed to realign with this spec

## Generated File Strictness

Generated files may be compact, but must be operational.

Each generated file must include:

- file purpose
- load/use rule
- source-of-truth rule
- safety gate relevant to that file

Do not generate placeholder-only files unless file is index/map intended to be filled later.

Generated architecture manifests must not pretend to know project architecture.

If architecture is not inspected yet, mark sections as:
`TODO: Fill after repository analysis. Do not treat as verified.`

## Generated File Content Contract

When bootstrapping project, generated files must follow these rules.

### `CLAUDE.md`

Must be compact.

Must include:

- Claude is router + planner + handoff writer.
- Claude must not edit source code.
- User may give raw task details.
- Claude loads `docs/ai/task-router.md`.
- Claude uses `docs/ai/module-ownership-map.md` for domain lookup.
- contract context files in load order
- Claude outputs Task Classification first.
- Claude routes to detailed prompt templates.
- Claude writes `.ai-scratchpad.md` only after approval.
- Claude uses `Status: IMPLEMENTATION_READY` only for approved handoff.
- Deep tasks require approval before implementation handoff.
- Load order.
- Navigation docs are maps only, not proof.
- Claude treats context docs as maps only.
- source code wins over context docs
- Claude verifies against source code.
- Claude marks `CONTEXT DRIFT` when context docs conflict with code.
- Claude marks `CONTRACT DRIFT` when contract docs conflict with code.
- Claude marks `UNMAPPED DOMAIN` when domain is missing.
- Claude marks `UNMAPPED CONTRACT` when contract is missing.
- Claude marks `UNMAPPED RISK` when risk area is missing.
- Prompt Template Routing.
- Task Size Classification.
- Deep defaults.
- Source of truth rules.
- `UNVERIFIED DEPENDENCY` rule.
- Output rule.
- Quality gate.

`CLAUDE.md` must route to `docs/ai/prompts/*`.

It must not duplicate every detailed prompt.

### `AGENTS.md`

Must be loader pointer.

Must tell agents to load:

1. `CLAUDE.md`
2. `docs/ai/entry-point.md`
3. `docs/ai/task-router.md`
4. `docs/ai/architecture-manifest.md`
5. `docs/ai/module-ownership-map.md`
6. `docs/ai/contracts/api-contracts.md`
7. `docs/ai/contracts/db-contracts.md`
8. `docs/ai/testing-strategy.md`
9. `docs/ai/risk-register.md`
10. `docs/ai/file-index/repository-map.md`

Must state:

- Claude routes/plans/handoffs.
- Codex implements/validates from `.ai-scratchpad.md`.

### `.codex/instructions.md`

Must include:

- Codex implements and validates only.
- Source of truth is `.ai-scratchpad.md`.
- Codex may implement only if `Status: IMPLEMENTATION_READY`.
- Codex may validate only if `Status: IMPLEMENTATION_READY` or `Status: VALIDATION_READY`.
- Codex must not perform RCA.
- Codex must not infer missing API contract details.
- Codex must not infer missing DB/schema contract details.
- No architecture planning.
- No re-planning.
- No inferred missing details.
- No unrelated cleanup.
- Codex must stop if Contract Areas are missing or vague for Standard/Deep tasks.
- Codex validates only with commands listed in `.ai-scratchpad.md`.
- Scratchpad Completeness Gate.
- Deep Task Approval Gate.
- Implementation Mode.
- Validation Mode.
- Git Diff Boundary Check.
- Final output format.

### `.ai-scratchpad.md`

Must be empty handoff shell.

Must include status-gated scratchpad format.

Must include:

- `Status: EMPTY`
- Claude writes here.
- Codex implements only when `Status: IMPLEMENTATION_READY`.
- Codex validates only when `Status: IMPLEMENTATION_READY` or `Status: VALIDATION_READY`.
- Do not store long-term project docs here.
- human approval fields
- default guardrails

### `docs/ai/entry-point.md`

Must include:

- developer workflow summary
- context engineering summary
- contract engineering summary
- load order
- task router pointer
- domain map pointer
- context refresh pointer
- prompt route summary
- navigation docs are maps only
- source verification rule

### `docs/ai/task-router.md`

Must include:

- raw task input rule
- classification table
- ambiguity rules
- module ownership map lookup rule
- domain detection rule
- API contract map lookup rule
- DB contract map lookup rule
- testing strategy lookup rule
- risk register lookup rule
- task size rules
- Deep defaults
- context drift rule
- contract drift rule
- unmapped contract rule
- unmapped risk rule
- unmapped domain rule
- output classification block
- template selection rule
- approval requirement rule
- scratchpad write rule

### `docs/ai/module-ownership-map.md`

Generated `docs/ai/module-ownership-map.md` must include:

```md
# Module Ownership Map

Purpose:

Map product/business domains to implementation areas.

This file is map only.

It is not proof of behavior.

Verify all conclusions against real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.

If this map conflicts with source code, source code wins.

Mark stale or conflicting entries as `CONTEXT DRIFT`.

Mark missing domains as `UNMAPPED DOMAIN`.

## Domain Index

| Domain                | Frontend                                                        | Backend                                                         | Database / Schema                                               | Jobs / Automations                                              | Integrations                                                    | Tests                                                           | Risk     | Notes                                                                                          |
| --------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| Billing Requests      | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Deep     | TODO: Fill after repository analysis. Do not treat as verified.                                |
| Payments              | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Deep     | TODO: Fill after repository analysis. Do not treat as verified.                                |
| SMS Credits           | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Deep     | TODO: Fill after repository analysis. Do not treat as verified.                                |
| Plan Upgrades         | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Deep     | TODO: Fill after repository analysis. Do not treat as verified.                                |
| Auth / Permissions    | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Deep     | TODO: Fill after repository analysis. Do not treat as verified.                                |
| Customers             | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Standard | TODO: Fill after repository analysis. Do not treat as verified.                                |
| Appointments          | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Standard | TODO: Fill after repository analysis. Do not treat as verified.                                |
| Intake / Booking      | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Standard | TODO: Fill after repository analysis. Do not treat as verified.                                |
| Automations           | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Deep     | TODO: Fill after repository analysis. Do not treat as verified.                                |
| Messaging             | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Deep     | Includes messaging webhooks when applicable. Verify in source.                                 |
| Imports               | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Standard | TODO: Fill after repository analysis. Do not treat as verified.                                |
| Insights / Analytics  | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Standard | TODO: Fill after repository analysis. Do not treat as verified.                                |
| Platform Admin        | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Deep     | Admin workflows may affect billing, plans, roles, or platform operations. Verify risk by task. |
| Settings / Onboarding | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | TODO: Fill after repository analysis. Do not treat as verified. | Standard | TODO: Fill after repository analysis. Do not treat as verified.                                |
```

### `docs/ai/contracts/api-contracts.md`

Generated `docs/ai/contracts/api-contracts.md` must include:

```md
# API Contracts

Purpose:

Map important frontend-backend contracts.

This file is map only.

It is not proof of behavior.

Verify all conclusions against real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.

If this map conflicts with source code, source code wins.

Mark stale or conflicting entries as `CONTRACT DRIFT`.

Mark missing contracts as `UNMAPPED CONTRACT`.

## Contract Index

| Domain | Feature | Method | Endpoint / Route | Frontend Caller | Backend Handler | Request Shape | Response Shape | Auth / Permission | Risk | Notes |
| ------ | ------- | ------ | ---------------- | --------------- | --------------- | ------------- | -------------- | ----------------- | ---- | ----- |
```

### `docs/ai/contracts/db-contracts.md`

Generated `docs/ai/contracts/db-contracts.md` must include:

```md
# Database Contracts

Purpose:

Map important database models, ownership, and invariants.

This file is map only.

It is not proof of behavior.

Verify all conclusions against schema, migrations, services, jobs, and tests.

If this map conflicts with source code, source code wins.

Mark stale or conflicting entries as `CONTRACT DRIFT`.

Mark missing contracts as `UNMAPPED CONTRACT`.

## Contract Index

| Domain | Model / Table | Owner Module | Important Fields | Invariants | Mutation Paths | Transaction / Idempotency Rules | Related APIs / Jobs | Risk | Notes |
| ------ | ------------- | ------------ | ---------------- | ---------- | -------------- | ------------------------------- | ------------------- | ---- | ----- |
```

### `docs/ai/testing-strategy.md`

Generated `docs/ai/testing-strategy.md` must include:

```md
# Testing Strategy

Purpose:

Map task size and risk to expected verification.

This file is map only.

Commands must be verified from package scripts or repo docs before being listed as valid.

| Task Size | Minimum Verification                                                   | Extra Verification                                            | Manual QA           | Notes                                          |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------- | ---------------------------------------------- |
| Tiny      | targeted read-through or formatting check                              | none                                                          | visual/read-through | no behavior change                             |
| Express   | targeted type/lint/test if available                                   | related test if available                                     | focused flow        | single-layer change                            |
| Standard  | verified type/lint/test/build commands if available + related tests    | regression test when relevant                                 | affected workflow   | FE-BE or multi-file changes                    |
| Deep      | verified type/lint/test/build commands if available + regression tests | migration/payment/job/webhook/permission checks when relevant | full critical flow  | billing/payments/auth/jobs/schema/transactions |
```

### `docs/ai/risk-register.md`

Generated `docs/ai/risk-register.md` must include:

```md
# Risk Register

Purpose:

Map high-risk project areas.

This file is map only.

It is not proof of behavior.

Mark missing risk areas as `UNMAPPED RISK`.

| Risk Area | Why Risky | Default Task Size | Required Checks | Manual QA | Notes |
| --------- | --------- | ----------------- | --------------- | --------- | ----- |
```

### `docs/ai/context-refresh.md`

Generated `docs/ai/context-refresh.md` must include:

```md
# Context Refresh

Purpose:

Refresh AI navigation and contract docs without changing source code.

## Scope

## Files To Refresh

## Source Verification Rules

## Drift Markers

## Refresh Steps

## Output Summary
```

### `docs/ai/architecture-manifest.md`

Must be dense project map.

Must state it is not proof of behavior.

Must not pretend to know project architecture.

If architecture is not inspected yet, sections must say:
`TODO: Fill after repository analysis. Do not treat as verified.`

Must include placeholders for:

- Project Shape
- Frontend
- Backend
- Database / Schema
- API Contracts
- Auth / Permissions
- Jobs / Automations
- Verification Commands

### `docs/ai/file-index/repository-map.md`

Must be dense file ledger.

Must state it is not proof of behavior.

Must include index table.

### `docs/ai/prompts/bugfix-rca.md`

Must include:

- task router compatibility
- consult `docs/ai/module-ownership-map.md` after task classification
- consult API contract map for FE-BE bugs
- consult DB contract map for schema/model/mutation bugs
- consult risk register for Deep classification
- mark `CONTRACT MISMATCH`, `CONTRACT DRIFT`, or `UNMAPPED CONTRACT` when applicable
- identify likely domain
- mark `UNMAPPED DOMAIN` if missing
- mark `CONTEXT DRIFT` if map conflicts with code
- verify all domain assumptions against source code
- Task Classification block
- Repository Navigation Rule
- Required RCA Output
- FE-BE Contract Check
- Task Size Classification
- Planning Handoff
- Evidence Rule

Must forbid implementation steps.

Must forbid writing `Status: IMPLEMENTATION_READY`.

### `docs/ai/prompts/bugfix-plan.md`

Must include:

- approved RCA requirement
- Task Classification carry-forward
- plan steps must map to verified RCA facts and verified contracts
- plan steps mapped to RCA facts
- FE-BE Contract Check
- Migration Danger Gate
- include Contract Areas in Codex Scratchpad Output
- include Risk Register Notes in Codex Scratchpad Output
- Codex Scratchpad Output

Must write `.ai-scratchpad.md` with `Status: IMPLEMENTATION_READY` only after approval.

Must not write implementation handoff when contract details are unresolved.

Must forbid source edits.

### `docs/ai/prompts/feature-plan.md`

Must include:

- task router compatibility
- consult `docs/ai/module-ownership-map.md` after task classification
- consult API contract map before API planning
- consult DB contract map before schema planning
- consult risk register before task size finalization
- identify existing domain or proposed new domain
- reuse existing domain patterns when verified
- mark `UNMAPPED DOMAIN` if feature does not map cleanly
- verify all domain assumptions against source code
- feature discovery
- existing pattern discovery
- Task Classification block
- Task Size Classification
- FE-BE Contract Check
- Migration Danger Gate
- include Contract Areas in Codex Scratchpad Output
- include Risk Register Notes in Codex Scratchpad Output
- Codex Scratchpad Output

Must use Feature Discovery, not RCA.

Must write `.ai-scratchpad.md` with `Status: IMPLEMENTATION_READY` only after approval.

Must mark unresolved contracts as `UNVERIFIED DEPENDENCY`.

Must forbid source edits.

### `docs/ai/prompts/refactor-plan.md`

Must include:

- task router compatibility
- identify affected domain from `docs/ai/module-ownership-map.md`
- consult API/DB contracts for public surface and invariant impact
- consult risk register for Deep Refactor Gate
- verify behavior ownership from source code
- mark `CONTEXT DRIFT` if map is stale
- include Contract Areas in Codex Scratchpad Output when relevant
- behavior preservation proof
- Task Classification block
- Task Size Classification
- public API surface check
- Deep Refactor Gate
- Codex Scratchpad Output

Must forbid broad cleanup.

Must forbid opportunistic changes.

Must write `.ai-scratchpad.md` with `Status: IMPLEMENTATION_READY` only after approval.

Must forbid behavior-changing contract drift.

Must forbid source edits.
