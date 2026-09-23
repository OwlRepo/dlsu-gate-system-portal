# Entry Point

> Purpose: the front door to `docs/ai/` — what this repo is and how these docs fit together.
> Load rule: read first when you land in the repo and need orientation (the nested `apps/*/AGENTS.md` files point here).
> Source of truth: every file here is a MAP, never proof. Real code, tests, types, migrations and routes win. If a map conflicts with code, code wins — mark `CONTEXT DRIFT` and fix the map in the same change.

The DLSU Gate System Portal is a production physical-access-control system: a NestJS API (`apps/backend`) that syncs a roster from an external SQL Server source and the BioStar 2 device network and logs every gate decision, plus a Next.js portal (`apps/portal-web`) for admins and employees. Project facts live in `CLAUDE.md`; the workflow core (Canonical Task Flow) lives in `AGENTS.md`. Do not restate them; read them.

Two layers, one home per fact:

- `.ai-engineering/` — **rules**: role contracts (`agents/`), constitution, safety invariants, lifecycle, evidence policy (`core/`), workflows, templates, memory. It never states project facts.
- `docs/ai/` — **phase docs and project maps**: loaded at their flow node, and facts about this codebase. A map never states an obligation; a phase doc states the rule for its node.

Unknowns are written `TODO: Fill after repository analysis. Do not treat as verified.`; inferences are marked `(inferred, please correct if wrong)`.

## Context order (code-changing task)

1. `AGENTS.md` — workflow core.
2. `docs/ai/task-router.md` — classify intent, size, domain, risk; skill mappings.
3. `docs/ai/architecture-manifest.md` — system shape.
4. `docs/ai/module-ownership-map.md` — who owns the domain you touch.
5. `docs/ai/agent-orchestration.md` — before dispatching personas for a change that crosses backend and frontend.
6. `docs/ai/contracts/api-contracts.md` — controllers, DTOs, guards, gateways, the portal API client.
7. `docs/ai/contracts/db-contracts.md` — entities, tables, invariants.
8. `docs/ai/testing-strategy.md` — how to test, Strict TDD.
9. `docs/ai/risk-register.md` — is this Deep by default?
10. `docs/ai/file-index/repository-map.md` — exact paths.
11. `docs/ai/dev-environment.md` — env vars, commands, deploy path.
12. Related tests, then the target source.

Phase docs load at their flow node, not up front: `planning.md` + `plan-template.md` before writing a plan; `execution.md` before writing code; `handoff.md` before declaring done; `pr-evidence.md` before creating any PR. Bug RCA and plan prompts: `docs/ai/prompts/`. Refresh procedure: `docs/ai/context-refresh.md`. Autonomous layer (installed, `PILOT_FROZEN`): `docs/ai/autonomous-engineering.md`. Per-feature test artifacts: `docs/ai/test-plans/`.
