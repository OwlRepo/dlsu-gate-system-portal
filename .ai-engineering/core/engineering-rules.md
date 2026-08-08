# Engineering Rules

Before coding:

-   understand the request
-   inspect existing implementation
-   identify affected areas
-   check existing patterns

During coding — strict TDD, no exceptions:

-   RED: write or update the smallest failing test first, and observe it actually fail before writing production code
-   GREEN: implement the minimum production code needed to pass
-   REFACTOR: improve structure only after tests are green
-   bug fixes: the regression test comes first — it must fail against the pre-fix code, then pass after the fix
-   every touched file needs unit coverage; cross-layer/user-facing flows also need e2e coverage
-   make minimal correct changes; avoid unrelated refactors
-   keep backwards compatibility when possible

**Non-behavioral exemptions from TDD** (write directly, no failing test required): documentation-only, formatting-only, comment-only, config-only (non-behavioral), file-index-only changes.

**Hard gate:** no production code edits until the plan (see `templates/plan.md`) is complete for Standard/Deep tasks, and until a failing test has been observed failing for any behavior-changing task. Missing test tooling is not a reason to skip coverage — set it up first.

Before every edit: confirm the file path exists, locate the exact symbol to modify, inspect nearby code, verify imports/exports, check related tests, check consumers for public API impact. See `core/evidence-policy.md` for the "never assume" rules this depends on.

Before PR:

-   review diff
-   run validation in the order set by `core/evidence-policy.md`
-   confirm acceptance criteria
-   run the QA gate (`agents/qa.md`)
