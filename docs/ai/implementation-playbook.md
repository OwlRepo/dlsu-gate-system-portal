# Deterministic Implementation Playbook

## Hard Gate
No code edits until all sections below are complete.

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

Focus on externally observable behavior, not internal-only details.

## Code-Fact Evidence (Required)
Must include:
- exact file paths inspected
- exact functions/classes/components/routes involved
- current behavior observed from repository evidence
- constraints derived from code/tests/config

No theory-only plans. Evidence first.

## Web Verification Rule
If required facts are external/time-variant/not derivable from repo evidence, do targeted web verification and cite source category used.

## File Anchor Verification Before Edit
- confirm path exists
- locate exact symbol to modify
- inspect nearby code
- verify imports/exports
- check related tests
- check consumers for public API impact
