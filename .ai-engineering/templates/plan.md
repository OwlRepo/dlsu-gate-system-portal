# Engineering Plan

One canonical plan template for all three lanes (Bug / Feature / Refactor). Open with the TL;DR, then fill the Common Sections, then the lane-specific section that applies.

## TL;DR (required — see `core/communication-contract.md`)

- Plain English, no unexplained jargon, lead with an analogy.
- Small visualization (flow/table/before-after) only if it genuinely shortens understanding.
- A few lines: what's broken/needed, why, what's about to change, what to expect once done.

## Common Sections

**Goal** — what this plan accomplishes.

**Context Consultation** — which of `knowledge/module-ownership-map.md`, `api-contracts.md`, `db-contracts.md`, `testing-strategy.md`, `risk-register.md` were checked; note any `CONTEXT DRIFT` / `CONTRACT DRIFT` / `UNMAPPED *` found.

**Task Size** — Tiny / Express / Standard / Deep, per `workflows/task-intake.md`.

**Files** — every file this plan touches.

**Implementation Steps** — numbered. Each step: file + location, exact change, reason (tie back to RCA fact / feature requirement / refactor goal), contract impact, test impact.

**Contract Impact** — API/DB/schema changes, or `No contract impact.`

**Verification & Testing Plan** — tests to add (TDD: failing test written and observed failing first, per `core/engineering-rules.md`), verification commands in the order from `core/evidence-policy.md`, manual QA steps, regression coverage.

**Rollback / Risk Mitigation** — how to revert, risk notes.

**Done Criteria** — how to confirm this is actually finished.

**Approval** — Standard/Deep requires explicit sign-off before implementation starts (`Deep implementation approved: Yes` for Deep). Implementation proceeds directly in this thread, one step at a time, once approved — this is not a handoff artifact for another agent.

## Bug lane addition

Requires an approved RCA (`templates/rca-report.md`) first — plan steps must map to confirmed RCA facts, not new investigation. State the RCA root cause being fixed and the regression test that will prove it.

## Feature lane addition

**Existing System Discovery** — does a similar feature already exist? What patterns get reused? Where does this fit in current architecture? Trace current data/control flow before proposing new flow.

**Migration Danger Gate** (if schema changes involved) — migration required? backfill required? default/nullability? index/constraint impact? existing data impact? rollback possible? deployment ordering risk? Any unknown answer → `UNVERIFIED DEPENDENCY`, stop until resolved.

## Refactor lane addition

**Existing Behavior Proof** — public API surface, props contract, response schema, schema invariants, state shape, error handling — all as currently verified, must be preserved.

**Public API Surface Check** — list affected public APIs; mark any that would change signature as `BREAKING CHANGE` (requires separate explicit approval: `Breaking change approved: Yes`).

State explicitly: `No API contract changes required.` / `No schema changes required.` unless a breaking change was approved. See `workflows/refactor.md` for the Deep Refactor Gate.

## Constraints (all lanes)

Do not modify unlisted files. Do not bundle unrelated refactors or cleanup. Do not change public APIs or schema unless the task requires it and it's been explicitly approved. Preserve existing architecture patterns.
