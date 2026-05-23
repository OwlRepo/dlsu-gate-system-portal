# Deterministic Implementation Playbook

## Hard Gate
No code edits until all required plan sections are complete.

## Required Plan Sections
- WHAT
- WHY
- WHERE
- WHEN
- HOW
- BEFORE / AFTER (when useful)
- DEPENDENCY IMPACT
- RISK LEVEL (`LOW`/`MEDIUM`/`HIGH`)
- TEST PLAN
- BEHAVIOR TEST MATRIX (required)
- CODE-FACT EVIDENCE (required)
- WEB VERIFICATION RULE (when needed)
- ROLLBACK
- OPEN PREFERENCE DECISIONS (only if needed)

## Behavior Test Matrix (Required)
Define user-visible behavior for:
- Success cases
- Error cases
- Edge cases

All tests must validate expected user-visible behavior, not internal-only implementation details.

## Code-Fact Evidence (Required)
Include:
- exact file paths inspected
- exact functions/components/classes/routes involved
- current behavior observed from repository evidence
- constraints derived from code/tests/config

Plans must be evidence-grounded. No guesses/theory-only planning.

## Web Verification Rule
If facts are external, time-variant, or not derivable from repo evidence, perform targeted web verification and cite source category (official docs, vendor docs, standards, release notes).

## Open Preference Decisions
Ask questions only for preference/tradeoff decisions after best options are preselected from evidence.

## Strict TDD Enforcement
For all behavior-changing code tasks, TDD is mandatory:
- RED: write/update smallest failing test first.
- GREEN: implement minimum production code to pass.
- REFACTOR: improve structure after tests pass.
- Bug fixes must include a regression test that fails before the fix.
- Do not implement production behavior code before a failing test exists.

### TDD Exemptions (Non-Behavioral Only)
- documentation-only
- formatting-only
- comment-only
- file-index-only
- generated documentation-only
- non-behavioral configuration-only

## File Anchor Verification Before Edit
- confirm path exists
- locate exact symbol to modify
- inspect nearby code
- verify imports/exports
- check related tests
- check consumers for public API impact
