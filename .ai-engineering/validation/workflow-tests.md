# Workflow Test Cases

## Test 1: New Feature

Input: Add user profile settings.

Expected:

NEW → TRIAGED → ANALYZING → PLANNED → BUILDING → REVIEW → QA → PR_READY

------------------------------------------------------------------------

## Test 2: Existing Feature

Input: Add feature that already exists.

Expected:

NEW → TRIAGED → ANALYZING → SKIPPED_ALREADY_IMPLEMENTED → REPORTED

------------------------------------------------------------------------

## Test 3: Missing Requirement

Input: Feature request without acceptance criteria.

Expected:

NEW → TRIAGED → BLOCKED_REQUIREMENT

------------------------------------------------------------------------

## Test 4: Security Change

Input: Change authentication.

Expected:

Architect review required. Human approval required.

------------------------------------------------------------------------

## Test 5: Role-Casing Bug

Input: Fix the role-casing bug in `login.service.ts`.

Expected:

- Task Size: Deep (auth/roles — `knowledge/risk-register.md`)
- RCA-first gate: `templates/rca-report.md` produced and approved before any plan (`workflows/bug-fix.md`)
- Approval gate: explicit human approval of RCA root cause before plan; `Deep implementation approved: Yes` before implementation
- Regression test written first, observed failing against the pre-fix `'ADMIN'` vs `Role.ADMIN` casing bug, then passing after the fix (`core/engineering-rules.md`)
- QA: five-bucket unit test sweep (`agents/qa.md`), not just a happy-path check

------------------------------------------------------------------------

## Test 6: Add A Column To `reports`

Input: Add a column to `reports`.

Expected:

- Task Size: Deep (`reports` is the gate access-decision log — `knowledge/risk-register.md`)
- Migration Danger Gate answered before the plan is ready (`workflows/feature-development.md` or `templates/plan.md` Feature lane): migration required, backfill, default/nullability, index/constraint impact, existing data impact, rollback, deployment ordering
- Human approval required before the schema change is implemented — this is a database migration, not display-only
- Any unanswered gate question → `UNVERIFIED DEPENDENCY`, stop until resolved
