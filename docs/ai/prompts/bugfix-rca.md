# Template: Bugfix RCA

> Purpose: root-cause a bug BEFORE writing any code.
> When to use: any bug, error, regression, crash, failing test, or broken behaviour (`docs/ai/task-router.md`).
> Source of truth: this is a MAP of the process. The real code proves the root cause.

Rule: produce the RCA with NO code, then STOP and wait for approval. Propose a direction, never edits. Open with a TL;DR led by an analogy (`.ai-engineering/core/communication-contract.md`).

Fill every section:

1. **Issue Selected** — the issue as stated by the requester (Linear ID if any).
2. **Bug Summary** — user-facing symptoms, error messages, unexpected behaviour; observed vs expected.
3. **Reproduction Flow From Code** — entry point, execution path through the code (files + functions + lines), where it manifests, state at the bug point. Not a guess.
4. **Backend Investigation** — controllers/services, DTO validation, guards, queries, `database-sync` / BioStar / SQL Server calls, logs, scheduled jobs.
5. **Frontend Investigation** (if applicable) — components, state, API client calls, socket handling, error handling.
6. **Backend↔Frontend Contract Check** (mandatory when both sides are involved) — what the portal sends / the API expects / the API returns / the portal expects; exact shapes; the mismatch; file + line on each side.
7. **Gate-access invariants** — does the bug touch `studentMutationLock`, BioStar rollback, role checks, or `reports` writes (`.ai-engineering/core/safety.md`)? Say which, or "none".
8. **Root Cause** — one precise statement, with the evidence for it AND the observation that would disprove it.
9. **Why Existing Code Allows The Bug** — the missing guard, wrong assumption, race, or gap.
10. **Eliminated Causes** — plausible causes ruled out, and how ("checked, not it").
11. **Remaining Uncertainties** — what could not be verified.
12. **Confidence Level** — High / Medium / Low, with a one-line justification.
13. **Basic Solution Direction** — the shape of the fix, not the diff.
14. **Planning Handoff** — confirmed root cause, owning layer, primary/secondary files, confirmed contract details, ruled-out causes, the regression test that will prove it (`docs/ai/testing-strategy.md`).

Every conclusion cites source, tests, types, contracts, schema, logs or stack traces. Stop here; the plan (`docs/ai/prompts/bugfix-plan.md`) is written only after approval.
