# Task Router

Claude classifies raw task input and routes to appropriate template.

## Raw Task Input Types

- Plain English request
- Bug report (error, regression, crash, unexpected behavior)
- Feature request (new capability, enhancement, new workflow, product change)
- Refactor request (cleanup, rename, restructure, no behavior change)
- QA report
- Issue tracker ticket
- GitHub / Jira / Linear ticket
- Error log / stack trace
- Screenshot description
- User complaint
- Production incident
- Test failure output
- Code review comment
- Support report
- Question / explanation / discovery request

## Task Classification Table

| Input Intent | Internal Workflow | Template | Output |
| --- | --- | --- | --- |
| Bug, error, regression, crash, failing test, broken behavior, unexpected behavior, production incident, QA failure, support complaint | Bug RCA | `docs/ai/prompts/bugfix-rca.md` | RCA first. No plan until approved. |
| Approved RCA, request for fix plan, request to generate implementation plan after RCA | Bug Plan | `docs/ai/prompts/bugfix-plan.md` | Implementation Plan Summary, then Claude implements directly. |
| New capability, enhancement, new workflow, new UI behavior, new API behavior, product behavior change | Feature Plan | `docs/ai/prompts/feature-plan.md` | Feature Discovery + Implementation Plan Summary, then Claude implements directly. |
| Cleanup, rename, restructure, internal code quality change, no intended behavior change | Refactor Plan | `docs/ai/prompts/refactor-plan.md` | Risk-scoped Implementation Plan Summary, then Claude implements directly. |
| Question, explanation, code review, architecture review, discovery only | Read-only | None | Evidence-backed findings only. No implementation plan unless user asks. |

## Ambiguity Rules

If task could be multiple types, choose safest:

- Possible bug → Bug RCA
- Possible product behavior addition → Feature Plan
- Possible no-behavior cleanup → Refactor Plan
- Possible billing/payments/SMS/auth/roles/permissions/automations/jobs/webhooks/migrations/transactions → Deep task

## Task Classification Output Block

Claude outputs immediately:

```txt
Task Classification:
- Intent: [Bug RCA / Bug Plan / Feature Plan / Refactor Plan / Read-only]
- Workflow: [template name]
- Task Size: [Tiny / Express / Standard / Deep]
- Domain: [domain from module-ownership-map.md]
- Risk: [Low / Standard / Deep]
- Contract Areas: [API / Database / Permissions / External integrations / Jobs]
- Risk Register Notes: [from risk-register.md if Deep]
- Template Loaded: [template file path]
- Context Files Used: [files consulted]
- Next Action: [RCA / Discovery / Planning / Read-only findings]
```

## Post-Classification Workflow

After classification, Claude consults context docs in order:

1. **Module Ownership Map** (domain lookup)
   - Find likely frontend area
   - Find likely backend area
   - Find likely database/schema area
   - Find likely tests
   - Find domain risk level

2. **API Contracts** (FE-BE interface check)
   - Look up endpoint
   - Verify request shape
   - Verify response shape
   - Check auth/permission
   - Mark `CONTRACT DRIFT` if conflict with code

3. **Database Contracts** (schema/model check)
   - Look up models
   - Verify fields
   - Verify invariants
   - Check mutation paths
   - Mark `CONTRACT DRIFT` if conflict with code

4. **Testing Strategy** (verification expectations)
   - Look up verification commands by task size
   - Verify commands exist in package scripts or repo docs
   - Mark blocker if commands unavailable

5. **Risk Register** (high-risk classification)
   - Look up task area
   - Verify Deep default classification
   - Mark `UNMAPPED RISK` if area missing
   - Only downgrade Deep if source code proves isolation

Then load detailed prompt template and follow its instructions.

## Drift and Mapping Rules

### Context Drift

When verified source code contradicts module-ownership-map.md:

- Mark `CONTEXT DRIFT`
- Report stale file and section
- Use source code as truth for current task
- Do not rewrite maps unless user asks for context refresh

### Contract Drift

When verified source code contradicts api-contracts.md or db-contracts.md:

- Mark `CONTRACT DRIFT`
- Report stale file and section
- Use source code as truth for current task
- Do not rewrite contracts unless user asks for context refresh

### Unmapped Domain

When task domain does not appear in module-ownership-map.md:

- Mark `UNMAPPED DOMAIN`
- Use source code inspection to locate relevant files
- Proceed with RCA/discovery
- Do not block on unmapped domain

### Unmapped Contract

When contract is missing from api-contracts.md or db-contracts.md:

- Mark `UNMAPPED CONTRACT`
- Use source code to verify contract
- Proceed with RCA/discovery/planning
- Do not block on unmapped contract

### Unmapped Risk

When risk area is missing from risk-register.md:

- Mark `UNMAPPED RISK`
- Use source code and risk assessment to classify
- Proceed with RCA/discovery/planning
- Do not block on unmapped risk

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

### Standard

- multiple files or FE-BE coordination
- moderate regression risk
- requires contract verification
- requires targeted tests

### Deep

- high-risk or production-critical
- requires full RCA/discovery
- requires plan approval
- requires regression tests
- requires manual QA
- requires rollback notes

## Deep Default Classification

Default to Deep for:

- Billing Requests
- Payments
- SMS Credits
- Plan Upgrades
- Auth / Roles / Permissions
- Automations / Jobs / Webhooks
- Database schema / migrations / transactions
- Production-critical workflows

Only downgrade Deep if repository evidence proves task is isolated and low-risk.

## Verification Dependency Rule

When task depends on unverified contract details:

- Mark `UNVERIFIED DEPENDENCY`
- List missing contract details
- Do not proceed to implementation planning until resolved
- Request contract verification or source code inspection

## Output Quality Gate

- Classification block present and complete
- Domain lookup performed (or marked unmapped)
- API contract check performed (or marked unmapped/drift)
- DB contract check performed (or marked unmapped/drift)
- Risk assessment performed (or marked unmapped)
- Verification strategy identified
- No inference beyond source code
- Template selected appropriately
- All drift markers applied when needed
