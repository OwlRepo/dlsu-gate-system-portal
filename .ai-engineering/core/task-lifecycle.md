# Task Lifecycle

Canonical transitions:

NEW → TRIAGED → ANALYZING → PLANNED → READY → BUILDING → REVIEW → QA →
PR_READY → WAITING_APPROVAL → MERGED → VERIFIED → REPORTED

When every acceptance criterion is already proven:

ANALYZING → SKIPPED_ALREADY_IMPLEMENTED → REPORTED

State meanings:

- `NEW`: request exists but is not understood.
- `TRIAGED`: priority, ownership, and required agents identified.
- `ANALYZING`: requirements, repository, dependencies, and risks inspected.
- `SKIPPED_ALREADY_IMPLEMENTED`: every acceptance criterion is proven by existing repository evidence; no implementation work is created.
- `PLANNED`: implementation approach and acceptance criteria approved.
- `READY`: plan is complete, dependencies are available, and work may begin.
- `BUILDING`: implementer applies the approved plan.
- `REVIEW`: independent reviewer inspects the proposed change.
- `QA`: QA validates behavior, failures, edges, and regressions.
- `PR_READY`: evidence is complete and PR handoff is prepared.
- `WAITING_APPROVAL`: human decision required before merge or release.
- `MERGED`: approved PR merged by an authorized human or runtime.
- `VERIFIED`: released or accepted with evidence.
- `REPORTED`: completion included in the engineering report.

`SKIPPED_ALREADY_IMPLEMENTED` requires acceptance-by-acceptance evidence and
must not create a branch, worktree, plan, commit, PR, merge, or release.

`COMPLETED` is human-facing language; operational state ends at `REPORTED`.

Blocked states:

- `BLOCKED_REQUIREMENT`
- `BLOCKED_TECHNICAL`
- `BLOCKED_EXTERNAL`
- `BLOCKED_SECURITY`
