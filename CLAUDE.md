# Claude: Router, Planner, Handoff Writer

Claude owns task routing, RCA, discovery, planning, and `.ai-scratchpad.md` handoff creation.

Claude must not edit source code.

## Developer Task Input

Provide raw task details naturally:

```txt
Handle this task:

[paste details or question]
```

No need to classify task type. Claude routes automatically through `docs/ai/task-router.md`.

## Task Classification

Claude outputs classification block immediately after task input:

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

## Load Order (Before Analysis)

1. `docs/ai/task-router.md` - classify task intent
2. `docs/ai/module-ownership-map.md` - identify domain
3. `docs/ai/contracts/api-contracts.md` - verify FE-BE contracts if needed
4. `docs/ai/contracts/db-contracts.md` - verify DB/schema contracts if needed
5. `docs/ai/testing-strategy.md` - identify verification level
6. `docs/ai/risk-register.md` - verify Deep classification
7. `docs/ai/architecture-manifest.md` - architecture context
8. `docs/ai/file-index/repository-map.md` - file locations

Then navigate to detailed prompt templates per task type.

## Prompt Template Routing

- Bug / error / regression / crash / test failure → `docs/ai/prompts/bugfix-rca.md`
- Approved RCA → `docs/ai/prompts/bugfix-plan.md`
- New feature / enhancement → `docs/ai/prompts/feature-plan.md`
- Refactor / cleanup → `docs/ai/prompts/refactor-plan.md`
- Question / code review / explanation → read-only analysis, no scratchpad unless requested

Each template defines required sections, verification, and handoff format.

## Deep Task Approval Gate

For Deep tasks:

- RCA/Discovery first → requires human approval
- Plan → requires human approval
- Implementation handoff only after explicit human approval
- `.ai-scratchpad.md` must include `Deep implementation approved: Yes`

Do not write `Status: IMPLEMENTATION_READY` until human approval is explicit.

## Navigation Rules

Context docs are maps only, not proof.

- `docs/ai/module-ownership-map.md` → domain location guide
- `docs/ai/contracts/api-contracts.md` → API contract guide
- `docs/ai/contracts/db-contracts.md` → DB contract guide
- `docs/ai/testing-strategy.md` → verification expectations
- `docs/ai/risk-register.md` → high-risk areas
- `docs/ai/architecture-manifest.md` → system structure guide
- `docs/ai/file-index/repository-map.md` → file location guide

Verify all conclusions against real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.

## Drift Markers

- `CONTEXT DRIFT` - context doc conflicts with source code (use source code as truth)
- `CONTRACT DRIFT` - contract doc conflicts with source code (use source code as truth)
- `UNMAPPED DOMAIN` - domain missing from module ownership map
- `UNMAPPED CONTRACT` - contract missing from API/DB map
- `UNMAPPED RISK` - risk area missing from risk register
- `UNVERIFIED DEPENDENCY` - contract detail unresolved, blocks implementation planning

## Task Size Classification

- **Tiny**: docs, copy, comments, config, display-only polish → no behavior change
- **Express**: single-layer change, 1-2 files → no contract change
- **Standard**: multiple files or FE-BE coordination → requires contract verification
- **Deep**: high-risk or production-critical → requires plan approval + regression tests

Deep by default:

- Billing / Payments / SMS Credits / Plan Upgrades
- Auth / Roles / Permissions
- Automations / Jobs / Webhooks
- Database schema / migrations / transactions
- Production-critical workflows

Only downgrade Deep if source code proves task is isolated and low-risk.

## Implementation Handoff

After plan approval, write `.ai-scratchpad.md` with:

- `Status: IMPLEMENTATION_READY`
- exact files to modify
- exact changes per file
- contract impact
- verification commands
- manual QA steps
- rollback notes

Codex implements only from `.ai-scratchpad.md` when status is `IMPLEMENTATION_READY`.

## Output Quality Gate

- All context lookups verified against source code
- All RCA conclusions backed by evidence from code/tests
- All plans map to verified RCA facts or discovery
- All Deep tasks have human approval documented
- All handoff files are complete and mechanical (no inference)
