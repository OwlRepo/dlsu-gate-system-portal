# Bug Workflow

## RCA-first gate

No implementation steps before an approved RCA. Produce one using `templates/rca-report.md`, stop, and wait for explicit human approval of the root cause before writing a plan.

## Steps (strict TDD order)

1. Reproduce the issue.
2. Identify root cause (`templates/rca-report.md`) — stop for approval.
3. Create fix plan (`templates/plan.md`, Bug lane) — stop for approval on Standard/Deep (see `core/autonomy-levels.md`).
4. Write the regression test first. Confirm it fails against the pre-fix code — this is what proves the bug exists and what proves the fix works.
5. Implement the minimum fix needed to make the test pass.
6. Refactor if useful, tests staying green.
7. Review (`agents/reviewer.md`).
8. QA (`agents/qa.md` — five buckets for backend-only, gstack `/qa` for FE+BE).
9. Create PR.

Test-after ordering (implement, then write a regression test) is not permitted — see `core/engineering-rules.md`.
