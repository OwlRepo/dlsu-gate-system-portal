# Bug Plan Template

Use this template after RCA approval to plan bugfix implementation.

RCA must be approved before generating plan.

Every plan step must map to verified RCA facts.

Do not redo RCA unless required to verify implementation detail.

## Required Sections

### 1. Plan Overview & Scope

Summarize:

- Bug being fixed
- RCA root cause (from approved RCA)
- Scope of fix (what changes, what stays the same)
- Estimated task size (Tiny / Express / Standard / Deep)
- Dependencies or blockers

### 2. Database & Schema Changes

If bugfix requires database changes:

- Schema changes (new fields, types, constraints)
- Migrations needed
- Data preservation or backfill requirements
- Rollback procedure

If no schema changes: State `No schema changes required.`

### 3. Backend Implementation Steps

Numbered steps for backend changes.

Each step includes:

- File and location
- What to change
- Why (reference to RCA fact)
- Contract impact (if any)
- Test impact

### 4. Frontend Implementation Steps

Numbered steps for frontend changes.

Each step includes:

- File and location
- What to change
- Why (reference to RCA fact)
- Contract impact (if any)
- Test impact

### 5. FE vs BE Contract Check

If FE-BE fix, document:

- **Frontend now sends** (updated request format)
- **Backend now expects** (updated input schema)
- **Backend now returns** (updated response format)
- **Frontend now consumes** (updated output schema)
- **Compatibility risk** (will old clients break? do we need versioning?)

### 6. Implementation Verification & Testing Plan

Include:

- Unit tests to add or update
- Integration tests if needed
- Regression tests to prevent re-occurrence
- Verification commands (from testing-strategy.md)
- Manual QA steps

### 7. Rollback / Risk Mitigation Plan

Include:

- How to safely rollback if needed
- Emergency revert procedure
- Risk mitigations

### 8. Codex Scratchpad Output

Generate `.ai-scratchpad.md` with:

- Task Summary
- Task Type: Bugfix
- Task Size: [from Plan Overview]
- Human Approval: [RCA approved: Yes]
- Confirmed Facts: [from RCA]
- Files To Modify: [list from implementation steps]
- Exact Changes Per File: [mechanical, step-by-step]
- API Contract Changes: [from FE-BE Contract Check or "No API contract changes required."]
- Database / Schema Changes: [from section 2 or "No schema changes required."]
- Contract Areas: [API / Database / Permissions / External integrations / Jobs]
- Risk Register Notes: [if applicable]
- Implementation Order: [step sequence]
- Verification Commands: [from testing-strategy.md]
- Manual Verification Flow: [QA steps]
- Rollback / Risk Notes: [from section 7]
- Done Criteria: [how to confirm fix works]

Status: IMPLEMENTATION_READY (only after approval)

## Plan Step Format

Each implementation step should follow this format:

```
### Step N: [Brief description]

**File**: `path/to/file`

**Location**: Line XX or function name

**Change**: [What exactly to change]

**Reason**: [Why this change, reference to RCA]

**Contract Impact**: [Does this affect API/DB/permissions?]

**Test Impact**: [What tests need to change?]
```

## Migration Danger Gate

If schema changes are involved, answer before planning:

- Migration required? [Yes/No]
- Backfill required? [Yes/No, describe data transformation if needed]
- Default/nullability? [What default values, nullable or not?]
- Index or constraint impact? [Any performance or uniqueness impact?]
- Existing data impact? [Will migration affect existing records?]
- Rollback possible? [Can we safely rollback?]
- Deployment ordering risk? [Does this need to deploy before/after other changes?]

If any answer is unknown, mark `UNVERIFIED DEPENDENCY`.

Do not proceed to scratchpad until resolved.

## Constraints

- Do not modify unlisted files
- Do not refactor unrelated code
- Do not introduce new behavior
- Do not change public APIs unless bug fix requires it
- Preserve existing architecture patterns

## Approval Requirement

Plan should be reviewed for:

- RCA facts correctly reflected in steps
- Steps are complete and mechanical
- No unrelated cleanup included
- Verification strategy is realistic
- Rollback plan is workable

After approval, write scratchpad with Status: IMPLEMENTATION_READY.

If Deep task, require explicit approval: `Deep implementation approved: Yes`

Do not write scratchpad until approval is confirmed.
