# Task Router

> Purpose: turn an incoming request into a workflow, a task size, and a risk level.
> Load rule: run this first on any task (flow node B) before touching code.
> Source of truth: this is a MAP. The real code and `docs/ai/risk-register.md` decide what is actually risky. If a map conflicts with code, code wins.

No need for the human to name the task type — classify from the raw input: plain-English request, bug report, Linear issue, error log, stack trace, review comment, or question.

## Routing table

Intent values: `BUG_FIX` · `ENHANCEMENT` · `NEW_FEATURE` · `REFACTOR` · `PERFORMANCE` · `INFRASTRUCTURE` · `DOCUMENTATION` · `QUESTION`. Classify each task exactly once.

| Intent | Prompt doc | Skill |
|---|---|---|
| Bug / error / regression / crash / failing test / production incident | `docs/ai/prompts/bugfix-rca.md` — RCA first, NO code until approved → then `docs/ai/prompts/bugfix-plan.md` | `/investigate` |
| Enhancement of existing behaviour | `docs/ai/prompts/feature-plan.md` | `ecc:plan` |
| New capability / new UI / new endpoint | `docs/ai/prompts/feature-plan.md` | `ecc:feature-dev` |
| Cleanup / rename / restructure, no behaviour change | `docs/ai/prompts/refactor-plan.md` (+ `.ai-engineering/workflows/refactor.md`) | — |
| Performance | required analysis below | — |
| Deploy scripts / Windows service / env / tooling config | required analysis below — Deep by default, with an operational-verification checklist (`.ai-engineering/workflows/release.md` "Infra lane") | — |
| Documentation | required analysis below | `ecc:update-docs` |
| Question / explanation / review / discovery | read-only, no plan, no file changes | `ecc:code-review` or `/review` for diffs |
| QA | — | `/qa` (fixes), `/qa-only` (report), `ecc:test-coverage` |

Other skills: `/plan-eng-review` (architecture plan review), `ecc:security-review` (anything touching `auth`, `database-sync`, account management). gstack uses short names (`/investigate`, `/qa`); if a skill name fails to load, report it as an unresolved mapping instead of substituting an invented command.

### Required analysis for types without a prompt doc

- `PERFORMANCE`: measured bottleneck, baseline, hot path, proposed optimization, expected impact, measurement method, regression risks, observability. Never optimize on speculation.
- `INFRASTRUCTURE`: current environment, proposed change, compatibility/deployment impact, secrets/config impact, rollback procedure, required validation.
- `DOCUMENTATION`: audience, current gap, source-of-truth code/config, exact documents to update, examples requiring verification.

## Task size (fixed vocabulary)

- **Tiny** — docs, copy, comments, config, display-only. No behaviour change. Minimal verification.
- **Express** — single-layer, 1–2 files, no DB/schema/API contract change, low regression risk.
- **Standard** — multiple files or backend↔frontend coordination. Contract verification + targeted tests.
- **Deep** — high-risk/production-critical: auth/roles/permissions/sessions, `database-sync` (SQL Server source + BioStar), `reports` (the gate access-decision log), account management (`admin`/`super-admin`/`users`), TypeORM migrations/entities, screensaver upload, deployment scripts. Requires RCA/discovery, explicit approval, regression tests, manual QA, rollback notes.

Only downgrade Deep if repository evidence proves the task is isolated and low-risk. Do not substitute generic LOW/MEDIUM/HIGH labels.

## Ambiguity rule

When intent is unclear, pick the safest lane: possible bug → RCA; possible new behaviour → feature plan; possible no-behaviour-change → refactor plan; possibly touching auth, roles, `database-sync`, BioStar, migrations, gate-access logic or deploy scripts → Deep.

## Polyglot note

Two apps with different stacks (NestJS + Jest; Next.js + Vitest), Windows `.bat` deploy scripts in `deployment_docs_ws2022_prod/`, a Jenkins cron that calls `POST /database-sync/sync` (`apps/backend/Jenkinsfile`), and repo scripts in `scripts/` (node:test). Route and verify for the runtime actually involved.

## Mandatory classification output

Emit before starting work on any non-trivial task:

```
Task Classification:
- Intent:
- Workflow:
- Task Size:
- Domain:
- Risk:
- Contract Areas:
- Next Action:
```

Domain values come from `docs/ai/module-ownership-map.md`; risk from `docs/ai/risk-register.md`. Then check, in order: `module-ownership-map.md` → `contracts/api-contracts.md` → `contracts/db-contracts.md` → `testing-strategy.md` → `risk-register.md`.

## Drift and mapping markers

- Source contradicts a map → `CONTEXT DRIFT` (`CONTRACT DRIFT` for contracts, testing, risk). Report the stale section, use source as truth.
- Domain missing from the ownership map → `UNMAPPED DOMAIN`; contract missing → `UNMAPPED CONTRACT`; risk area missing → `UNMAPPED RISK`. Proceed using source inspection.
- Task depends on an unverified contract/schema/permission detail → `UNVERIFIED DEPENDENCY`. Stop — no implementation planning until resolved.
