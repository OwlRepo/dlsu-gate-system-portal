# Task Intake

Every task needs: objective, acceptance criteria, priority, risks, unknowns, dependencies. Unknown requirements become blockers (`workflows/blockers.md`).

No need for the human to name the task type — classify from raw input: plain-English request, bug report, feature request, refactor request, QA report, ticket, error log, stack trace, code review comment, or question.

## Classification table

| Input Intent | Workflow | Template | Output |
|---|---|---|---|
| Bug, error, regression, crash, failing test, broken/unexpected behavior, production incident | RCA first | `templates/rca-report.md` | RCA only. No plan until approved. |
| Approved RCA, request for fix plan | Bugfix Plan | `templates/plan.md` (Bug lane) | Plan, then direct implementation |
| New capability, enhancement, new UI/API/product behavior | Feature Plan | `templates/plan.md` (Feature lane) | Plan, then direct implementation |
| Cleanup, rename, restructure, no intended behavior change | Refactor Plan | `templates/plan.md` (Refactor lane), `workflows/refactor.md` | Plan, then direct implementation |
| Question, explanation, code review, architecture review, discovery only | Read-only | none | Evidence-backed findings only |
| Docker, CI/CD, hosting/deployment config | Infra | `workflows/release.md` | Operational-verification checklist, not unit-test-first |

## Ambiguity rule

If unsure, pick the safest lane: possible bug → RCA; possible new behavior → Feature Plan; possible no-behavior-change → Refactor Plan; possible auth/permissions/`database-sync`/migrations/gate-access-logic → Deep by default.

## Task size

- **Tiny** — docs, copy, comments, config, display-only. No behavior change. Minimal verification.
- **Express** — single-layer, 1-2 files, no DB/schema/API contract change, low regression risk.
- **Standard** — multiple files or FE-BE coordination. Requires contract verification + targeted tests.
- **Deep** — high-risk/production-critical: auth/roles/permissions/sessions, `database-sync` (SQL Server + BioStar integration), `reports` (gate access-decision log), account management (`admin`/`super-admin`/`users`), database migrations/TypeORM entities, screensaver upload, production deployment. Requires RCA/discovery, explicit human approval before plan, regression tests, manual QA, rollback notes.

Only downgrade Deep if repository evidence proves the task is isolated and low-risk. This is a fixed vocabulary — do not substitute generic LOW/MEDIUM/HIGH risk labels.

## Output block

Emit immediately after classifying:

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

## Post-classification lookup order

1. `knowledge/module-ownership-map.md` — domain, likely FE/BE/DB areas, tests, default risk
2. `knowledge/api-contracts.md` — FE-BE interface check
3. `knowledge/db-contracts.md` — schema/model check
4. `knowledge/testing-strategy.md` — verification commands for this task size
5. `knowledge/risk-register.md` — Deep classification confirmation

Then load the matched template/workflow.

## Drift and mapping markers

- Source code contradicts a `knowledge/*` map → `CONTEXT DRIFT` (or `CONTRACT DRIFT` for api/db contracts). Report the stale section, use source as truth, don't rewrite the map unless asked.
- Domain missing from `module-ownership-map.md` → `UNMAPPED DOMAIN`. Proceed anyway using source inspection.
- Contract missing → `UNMAPPED CONTRACT`. Proceed using source as truth.
- Risk area missing → `UNMAPPED RISK`. Proceed using source-based risk judgment.
- Task depends on an unverified contract/schema/permission detail → `UNVERIFIED DEPENDENCY`. Stop — do not proceed to implementation planning until resolved.
