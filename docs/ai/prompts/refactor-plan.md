# Template: Refactor Plan

> Purpose: restructure code without changing behaviour.
> When to use: cleanup, rename or restructure with no behaviour change (`docs/ai/task-router.md`).
> Deterministic rule: expand this plan per `docs/ai/planning.md` using the skeleton in `docs/ai/plan-template.md`; the lane rules live in `.ai-engineering/workflows/refactor.md`.

Required analysis before planning: the current structural problem with evidence (duplication, coupling, complexity), and whether the refactor is actually necessary for the requested outcome.

Open with a TL;DR led by an analogy. Fill every section:

## Behaviour-Preservation Statement
An explicit promise that observable behaviour does not change, and how it is proven: the tests pass against the base with `TDD-Waiver: refactor ...` (`npm run tdd:gate` inverts its check for refactors).

## Scope
Exact files in scope. Nothing outside this list changes.

## Characterization Tests First
Jest/Vitest tests that pin current behaviour BEFORE the refactor, so a green suite proves nothing changed. Add missing coverage first.

## Steps
Ordered, small, reversible literal old/new blocks.

## Verification
Same behaviour, tests green: the commands in `docs/ai/execution.md` "QA mode".

## Explicitly NOT Changing
Public APIs, DTOs, entities, socket events, and any file outside Scope. A signature change is `BREAKING CHANGE` and needs explicit approval — stop and discuss.
