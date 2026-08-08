# Bug RCA Report

Open with a TL;DR per `core/communication-contract.md`. No implementation steps in this document — stop after RCA and wait for approval (`workflows/bug-fix.md`).

1. **Issue Selected** — the issue as stated by the human.
2. **Bug Summary** — user-facing symptoms, error messages, unexpected behavior.
3. **Reproduction Flow From Code** — entry point, execution steps through code, where it manifests, state at bug point.
4. **FE Investigation** (if applicable) — affected components, state/props, event handlers, API calls, error handling, console errors.
5. **BE Investigation** (if applicable) — affected routes/handlers, service logic, DB queries, error handling, logging, jobs, external integrations.
6. **FE vs BE Contract Check** (mandatory for FE-BE bugs) — frontend sends / backend expects / backend returns / frontend expects, exact shapes; state the mismatch; cite evidence (file + line for each side).
7. **Root Cause** — one clear statement, e.g. "Component passes field X as string, backend expects number; no coercion, query fails."
8. **Why Existing Code Allows The Bug** — missing validation / type guard / null check / error handler / race condition / state mutation.
9. **Eliminated Causes** — what was ruled out and why.
10. **Remaining Uncertainties** — open questions: consistent across environments? edge cases untested?
11. **Confidence Level** — Low / Medium / High, with reasoning if not High.
12. **Basic Solution Direction** — type of fix only (e.g. "validate field X server-side"), no implementation steps.
13. **Planning Handoff** — confirmed root cause, owning layer, primary/secondary affected files, confirmed contract details, ruled-out causes, verification commands (`knowledge/testing-strategy.md`), planning constraints.

## Evidence rule

Every conclusion cites source code, tests, types, contracts, schema, logs, or stack traces. No inference without evidence — state uncertainty instead.

## Approval

RCA must be approved before a plan is written. Do not proceed to `templates/plan.md` until the human has signed off on the root cause.
