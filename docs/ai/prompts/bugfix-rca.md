# Bug RCA Template

Use this template for bug reports, errors, regressions, crashes, failing tests, or unexpected behavior.

Do not generate implementation steps.

Do not write `Status: IMPLEMENTATION_READY`.

Stop for approval after RCA.

## Task Router Compatibility

Loaded after task classification identifies Intent as Bug RCA.

Perform context lookups per task router before starting RCA.

## Context Consultation

After task classification, consult:

1. `docs/ai/module-ownership-map.md` - identify likely domain
2. `docs/ai/contracts/api-contracts.md` - if FE-BE contract issue
3. `docs/ai/contracts/db-contracts.md` - if schema/model/mutation issue
4. `docs/ai/testing-strategy.md` - identify verification expectations
5. `docs/ai/risk-register.md` - verify Deep classification

Mark any conflicts with source code as:

- `CONTEXT DRIFT` - map is stale
- `CONTRACT DRIFT` - contract map is stale
- `UNMAPPED DOMAIN` - domain missing
- `UNMAPPED CONTRACT` - contract missing
- `UNMAPPED RISK` - risk area missing

Use source code as truth.

## Required RCA Output

### 1. Issue Selected

State the issue from task input.

### 2. Bug Summary

Concise description of the bug from user perspective.

Include symptoms, error messages, unexpected behavior.

### 3. Reproduction Flow From Code

Trace the exact code execution path that causes the bug.

Include:

- Entry point (what user action or system event triggers the bug)
- Execution steps through code
- Where the bug manifests
- State at bug point

### 4. FE Investigation

If bug involves frontend:

- Affected components
- State/props at bug time
- Event handlers or lifecycle hooks
- API calls made
- Error handling
- Network activity
- Console errors

### 5. BE Investigation

If bug involves backend:

- Affected routes/handlers
- Service layer logic
- Database queries
- Error handling
- Logging output
- Related jobs/automations
- External integrations

### 6. FE vs BE Contract Check

For FE-BE bugs, mandatory section.

Document:

- **Frontend sends**: Exact request format
- **Backend expects**: Exact input schema/types
- **Backend returns**: Exact response format
- **Frontend expects**: Exact output schema/types
- **Mismatch**: If frontend sends what backend doesn't expect, or backend returns what frontend doesn't expect
- **Evidence**: Links to types, route definitions, component code

### 7. Root Cause

State the root cause clearly.

Example format:

"Component passes field X as string, but backend expects number. Backend doesn't validate/coerce, so query fails."

### 8. Why Existing Code Allows The Bug

Explain why the current code didn't prevent the bug.

- Missing validation?
- Missing type guard?
- Missing null check?
- Missing error handler?
- Race condition?
- State mutation?

### 9. Eliminated Causes

List potential causes you ruled out and why.

Helps verify RCA quality.

### 10. Remaining Uncertainties

Any questions or uncertainties about the bug?

- Is behavior consistent?
- Does it happen in all environments?
- Are there edge cases?

State uncertainties clearly.

### 11. Confidence Level

Rate RCA confidence: Low / Medium / High

If Low or Medium, state why more investigation might be needed.

### 12. Basic Solution Direction

Do NOT generate implementation steps.

State only the type of fix needed:

- "Validate field X in backend before use"
- "Add null check in component render"
- "Fix race condition with lock or queue"
- "Update API response shape to match frontend expectations"

### 13. Planning Handoff

State items for planning phase:

- Confirmed Root Cause
- Owning Layer (Frontend / Backend / Database / Integration)
- Primary Affected Files (top 3-5)
- Secondary Affected Files (related code)
- Confirmed Contract Details (if FE-BE)
- Files / Causes Ruled Out
- Required Verification Commands (from `docs/ai/testing-strategy.md`)
- Planning Constraints (env limitations, API restrictions, etc.)

## Evidence Rule

Every RCA conclusion must be backed by evidence from:

- Source code examination
- Test code
- Type definitions
- API contracts
- Database schema
- Error logs
- Stack traces

Do not infer. If you cannot find evidence, state uncertainty.

## FE-BE Contract Check Detail

This section is mandatory for FE-BE bugs.

Example format:

```
### FE vs BE Contract Check

**Frontend sends** (from component):
- field: string
- value: number

**Backend expects** (from route handler):
- field: string (required)
- value: string (validated as number)

**Backend returns** (from route handler):
- success: boolean
- data: { field, value }

**Frontend expects** (from component):
- success: boolean
- data: { field, value: number }

**Mismatch**:
- Backend returns value as string, frontend expects number
- Frontend component does not coerce string to number

**Evidence**:
- Frontend: `apps/portal-web/src/components/Example.tsx` line XX
- Backend: `apps/backend/src/routes/example.ts` line YY
- Type mismatch: Backend response type returns string, component expects number
```

## Output Format

Structure RCA as clear sections matching required output list.

Keep evidence-backed. Keep conclusions grounded in source code.

After RCA approval, human may ask for implementation plan.

## Approval Requirement

RCA must be approved before planning.

Claude stops after RCA.

Claude does not write scratchpad until RCA is approved and implementation plan is requested.
