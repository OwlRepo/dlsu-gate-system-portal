# Refactor Plan Template

Per CLAUDE.md's Plan Format Contract, open any plan produced from this template with a TL;DR (plain-English, analogy, optional small visualization) before the formal sections below.

Use this template for refactors, cleanup, renaming, restructuring, or internal code quality changes without intended behavior changes.

Preserve behavior unless user explicitly approved behavior change.

Refactor planning determines risk and scope of behavioral preservation.

## Task Router Compatibility

Loaded after task classification identifies Intent as Refactor Plan.

Perform context lookups per task router before starting analysis.

## Context Consultation

After task classification, consult:

1. `docs/ai/module-ownership-map.md` - identify affected domain
2. `docs/ai/contracts/api-contracts.md` - identify public API surface at risk
3. `docs/ai/contracts/db-contracts.md` - identify schema/model invariants at risk
4. `docs/ai/risk-register.md` - verify Deep Refactor Gate

Mark any conflicts with source code as:

- `CONTEXT DRIFT` - map is stale
- `CONTRACT DRIFT` - contract map is stale

Use source code as truth.

## Required Sections

### 1. Refactor Selected

State the refactoring work clearly.

Examples:

- Extract component X from file Y
- Rename module A to module B
- Move utilities from file X to shared lib
- Consolidate duplicated logic in functions A, B, C
- Restructure directory layout

### 2. Existing Behavior Proof

Document the current behavior that must be preserved.

Include:

- Public API surface (functions, methods, exports)
- Component props contract
- API response schema
- Database schema invariants
- State shape
- Error handling behavior

Verify from:

- Type definitions
- Source code
- Tests
- API contracts
- Database schema

### 3. Public API Surface Check

List all public APIs that could be affected:

- Exported functions/classes
- Component props
- API routes
- Database tables/models
- Jobs/automation triggers
- Webhook contracts

For each, verify:

- Is it used by other modules?
- Is it used by external consumers?
- Does refactor change its signature?
- Can old code still use it?

Mark any that would break as `BREAKING CHANGE`.

Breaking changes require explicit user approval.

### 4. Risk Boundaries

Identify scope of impact:

- Files that will change (direct)
- Files that import/use changed code (indirect)
- Tests that verify behavior
- Documentation that references changed code

Example:

```
Direct changes:
- src/utils/helper.ts

Indirect consumers:
- src/components/Feature.tsx
- src/services/API.ts

Tests:
- test/utils/helper.test.ts
- test/components/Feature.test.tsx
```

### 5. Implementation Steps

Numbered steps for refactor changes.

Each step includes:

- File and location
- What to change (rename, move, extract, consolidate)
- Why (refactor goal)
- Behavior impact (none expected)

Example:

```
### Step 1: Extract helper function

**File**: `src/utils/formatting.ts`

**Change**: Extract date formatting logic into new function formatDate()

**Why**: Consolidate duplicated date formatting code

**Behavior Impact**: None - same output for same input
```

### 6. Verification & Testing Plan

Include:

- Tests to add or update (no new behavior needed)
- Type checks to verify (types preserve structure)
- Verification commands (from testing-strategy.md)
- Manual QA steps (spot-check refactored areas)

Example verification:

```
1. Type checking: pnpm type-check
2. Unit tests: pnpm test utils/helper
3. Integration tests: pnpm test components/Feature
4. Spot check: Manually test renamed feature in app
```

### 7. Rollback / Risk Mitigation Plan

Include:

- How to safely rollback if needed
- Git commands for reverting
- Risk mitigations
- How to verify refactor didn't break anything

### 8. Implementation Plan Summary

Claude uses this summary to drive its own direct implementation, one step at a time, following the Testing Requirement (TDD-first) in CLAUDE.md. This is not a handoff artifact for another agent.

Include:

- Task Summary
- Task Type: Refactor
- Task Size: [from planning]
- Human Approval: [Plan approved: Yes]
- Confirmed Facts: [behavior to preserve]
- Files To Modify: [list from implementation steps]
- Exact Changes Per File: [mechanical, step-by-step]
- API Contract Changes: State `No API contract changes required.` (refactor preserves API)
- Database / Schema Changes: State `No schema changes required.` (refactor preserves schema)
- Contract Areas: [API / Database / Permissions - mark if at risk]
- Risk Register Notes: [if applicable]
- Implementation Order: [step sequence]
- Verification Commands: [from testing-strategy.md]
- Manual Verification Flow: [spot-check steps]
- Rollback / Risk Notes: [from section 7]
- Done Criteria: [refactor complete, all tests pass, behavior unchanged]

Claude proceeds to implement this plan directly, one step at a time, after approval below.

## Constraints

- Do not modify unlisted files
- Do not change behavior (unless user explicitly approved)
- Do not add features (refactor scope only)
- Do not refactor unrelated code
- Preserve architecture patterns
- Preserve public API surface (unless breaking change approved)
- Preserve database schema (unless schema change approved)

## Breaking Changes Rule

If refactor introduces breaking change (renamed export, API signature change, schema change):

- Mark `BREAKING CHANGE`
- Require explicit user approval: `Breaking change approved: Yes`
- List all breaking changes clearly
- Provide migration path for consumers if possible

Do not proceed with breaking changes without approval.

## Deep Refactor Gate

Some refactors are high-risk:

- Large-scope structural changes (e.g., complete module reorganization)
- Changes affecting many files (50+ files)
- Changes affecting core domain logic
- Changes affecting auth/permissions/billing logic
- Database-level refactors

High-risk refactors default to Deep.

Only downgrade to Standard/Express if:

- Refactor is isolated to single module
- Changes affect few files (< 10)
- No cross-module impact
- Behavior is fully covered by tests

If Deep, require plan approval before scratchpad.

## Approval Requirement

Plan should be reviewed for:

- Current behavior accurately documented
- Public API surface checked
- Risk boundaries identified
- Steps are complete and mechanical
- No behavior changes included
- No unrelated cleanup included
- Breaking changes explicitly listed and approved (if any)
- Verification strategy covers behavior preservation

After approval, begin implementation.

If Deep task, require explicit approval: `Deep implementation approved: Yes`

If breaking changes, require: `Breaking change approved: Yes`

Do not begin implementation until approval is confirmed.
