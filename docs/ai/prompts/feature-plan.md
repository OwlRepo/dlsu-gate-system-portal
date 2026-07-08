# Feature Plan Template

Per CLAUDE.md's Plan Format Contract, open any plan produced from this template with a TL;DR (plain-English, analogy, optional small visualization) before the formal sections below.

Use this template for new features, enhancements, new workflows, or product behavior changes.

Do not use RCA.

Use Feature Discovery instead.

Feature planning answers: where does this fit in existing system?

## Task Router Compatibility

Loaded after task classification identifies Intent as Feature Plan.

Perform context lookups per task router before starting discovery.

## Context Consultation

After task classification, consult:

1. `docs/ai/module-ownership-map.md` - identify domain and existing patterns
2. `docs/ai/contracts/api-contracts.md` - identify API contract impact
3. `docs/ai/contracts/db-contracts.md` - identify schema/model impact
4. `docs/ai/testing-strategy.md` - identify verification expectations
5. `docs/ai/risk-register.md` - verify Deep classification

Reuse existing domain patterns when verified in source code.

Mark any conflicts with source code as:

- `CONTEXT DRIFT` - map is stale
- `CONTRACT DRIFT` - contract map is stale
- `UNMAPPED DOMAIN` - domain missing
- `UNMAPPED CONTRACT` - contract missing
- `UNMAPPED RISK` - risk area missing

Use source code as truth.

## Required Sections

### 1. Feature Selected

State the feature from task input clearly.

### 2. Existing System Discovery

Inspect source code to find:

- Existing similar features
- Existing patterns to reuse
- Existing domain areas
- Existing data flow
- Existing API routes
- Existing database models

Answer:

- Does related feature already exist? Where?
- What patterns can be reused?
- Where does this fit in existing architecture?

### 3. Current Data / Control Flow

Document:

- User action that triggers feature
- Data flow through system
- API calls made
- Database operations
- State management
- Error handling

Trace through existing code to understand flow.

### 4. Feature Gap Analysis

What's missing from existing system?

- New data model? (list fields, relationships)
- New API route? (list endpoint, method, request/response)
- New component? (list UI elements)
- New service logic? (list business logic)
- New validation? (list rules)
- New permission check? (list access control)

### 5. API Contract Plan

If feature requires new API endpoints:

Document each endpoint:

- **Domain**: [feature domain]
- **Feature**: [feature name]
- **Method**: [GET / POST / PUT / DELETE / PATCH]
- **Endpoint**: [route path]
- **Frontend Caller**: [component or hook name]
- **Backend Handler**: [controller or route handler]
- **Request Shape**: [exact type, include example]
- **Response Shape**: [exact type, include example]
- **Auth / Permission**: [required auth, required role/permission]
- **Error Cases**: [possible errors and responses]

### 6. Database & Schema Changes

If feature requires database changes:

Document each model change:

- **Model / Table**: [name]
- **New Fields**: [field name, type, nullability, constraints]
- **Relationships**: [foreign keys, references]
- **Invariants**: [data constraints]
- **Migrations**: [migration steps needed]
- **Data Preservation**: [how to handle existing data]
- **Backfill**: [any data transformation needed]

If no schema changes: State `No schema changes required.`

### 7. Backend Implementation Steps

Numbered steps for backend changes.

Each step includes:

- File and location
- What to add or change
- Why (reference to feature requirement)
- Contract impact
- Test coverage

### 8. Frontend Implementation Steps

Numbered steps for frontend changes.

Each step includes:

- File and location
- What to add or change
- Why (reference to feature requirement)
- Contract impact
- Test coverage

### 9. External Integration / Background Job Steps

If feature uses external services or background jobs:

Document each integration point:

- Service/job type
- What it does
- When it runs
- Error handling
- Retry strategy
- Testing approach

### 10. Implementation Sequence

Sequence the implementation steps.

Consider:

- Database migrations must come first
- Backend APIs must come before frontend uses them
- Infrastructure setup before services
- Tests alongside feature code

### 11. Verification & Testing Plan

Include:

- Unit tests to add
- Integration tests if needed
- E2E tests for full flow
- Verification commands (from testing-strategy.md)
- Manual QA steps
- Regression test needs

### 12. Rollback / Risk Mitigation Plan

Include:

- How to safely rollback if needed
- Feature flags or gradual rollout if applicable
- Risk mitigations
- Emergency procedures

### 13. Implementation Plan Summary

Claude uses this summary to drive its own direct implementation, one step at a time, following the Testing Requirement (TDD-first) in CLAUDE.md. This is not a handoff artifact for another agent.

Include:

- Task Summary
- Task Type: Feature
- Task Size: [from planning]
- Human Approval: [Discovery approved: Yes]
- Confirmed Facts: [from discovery]
- Files To Modify: [list from implementation steps]
- Exact Changes Per File: [mechanical, step-by-step]
- API Contract Changes: [from section 5 or "No API contract changes required."]
- Database / Schema Changes: [from section 6 or "No schema changes required."]
- Contract Areas: [API / Database / Permissions / External integrations / Jobs]
- Risk Register Notes: [if applicable]
- Implementation Order: [step sequence from section 10]
- Verification Commands: [from testing-strategy.md]
- Manual Verification Flow: [QA steps from section 11]
- Rollback / Risk Notes: [from section 12]
- Done Criteria: [feature is working end-to-end]

Claude proceeds to implement this plan directly, one step at a time, after approval below.

## Feature Discovery Detail

Feature Discovery investigates where feature fits, not implementation details.

Research:

- Find existing similar features in codebase
- Trace their data flow
- Identify reusable patterns
- Verify domain ownership
- Check contract maps
- Verify nothing breaks with new feature

## Contract Verification Rules

For FE-BE features:

- **Frontend will send**: Exact request format
- **Backend should expect**: Exact input schema
- **Backend should return**: Exact response format
- **Frontend should consume**: Exact output schema
- **Compatibility risk**: Will old clients break? versioning needed?

Verify against source code types and contracts.

## Migration Danger Gate

If schema changes are involved, answer before planning:

- Migration required? [Yes/No]
- Backfill required? [Yes/No, describe]
- Default/nullability? [What defaults, nullable or not?]
- Index or constraint impact? [Any performance impact?]
- Existing data impact? [Interaction with existing records?]
- Rollback possible? [Can safely rollback?]
- Deployment ordering risk? [Deploy before/after other changes?]

If any answer is unknown, mark `UNVERIFIED DEPENDENCY`.

Do not proceed to scratchpad until resolved.

## Constraints

- Do not modify unlisted files
- Do not refactor unrelated code
- Do not change existing behavior unless feature requires it
- Preserve existing architecture patterns

## Approval Requirement

Plan should be reviewed for:

- Discovery facts correctly reflected in steps
- API contracts verified
- Schema changes validated
- Steps are complete and mechanical
- No unrelated cleanup included
- Verification strategy is realistic

After approval, begin implementation.

If Deep task, require explicit approval: `Deep implementation approved: Yes`

Do not begin implementation until approval is confirmed.
