# Feature Workflow

1. `NEW → TRIAGED`: Product Manager defines requirements, priority, ownership, unknowns, risks, and dependencies.
2. `TRIAGED → ANALYZING`: Architect evaluates the new feature, affected systems, alternatives, tradeoffs, and risks. Consult `knowledge/module-ownership-map.md` for reusable existing patterns before proposing new ones.
3. If all acceptance criteria are already proven, `ANALYZING → SKIPPED_ALREADY_IMPLEMENTED → REPORTED`: Coordinator records acceptance-by-acceptance evidence and dispatches no implementer or PR work. Otherwise, `ANALYZING → PLANNED → READY`: Coordinator creates the plan (`templates/plan.md`, Feature lane), assigns agents, records evidence requirements, and confirms blockers are clear.

   **Migration Danger Gate** — if the feature involves any schema change, answer before the plan is considered ready: Migration required? Backfill required? Default/nullability? Index or constraint impact? Existing data impact? Rollback possible? Deployment ordering risk? Any unknown answer → `UNVERIFIED DEPENDENCY`, stop until resolved.
4. `READY → BUILDING`: Implementer applies the approved plan, TDD (failing test first per `core/engineering-rules.md`), adds tests, and records files, tests, and commit evidence.
5. `BUILDING → REVIEW`: Reviewer independently checks requirements, correctness, security, architecture, maintainability, regressions, and tests.
6. `REVIEW → QA`: QA validates happy paths, failures, edges, regressions, and applicable UI states.
7. `QA → PR_READY`: Coordinator confirms acceptance evidence, review status, QA status, and validation results.
8. `PR_READY → WAITING_APPROVAL`: Reporter prepares the PR report. No merge or release occurs automatically without required approval.
9. `WAITING_APPROVAL → MERGED`: Human approves the merge when required; rejected or unclear decisions remain blocked.
10. `MERGED → VERIFIED → REPORTED`: Verify the accepted or released result with evidence, then Reporter records the handoff and EOD report.
