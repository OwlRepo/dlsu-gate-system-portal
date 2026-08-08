# Autonomous Engineering Canonical Manifest

This is the authoritative inventory for the **installed** `.ai-engineering/` layer in this repo — not a package to copy from. The source package (`autonomous-engineering-md-package/`) that this was installed from is deleted after install; this manifest is now the record of what exists and what's canonical.

Rules:

- Each responsibility has exactly one canonical file.
- Do not create alternate filenames for an existing responsibility.
- Extending this layer requires updating this manifest in the same change (see Extension Rule below).
- Undeclared duplicate rule or workflow files fail validation (`validation/bootstrap-check.md`).

## Repository Entry Point

`../CLAUDE.md` (repo root) is the entry point a session actually starts from — it routes into this directory. Referenced from `core/operating-model.md` and `runtime/claude.md`.

## Project Knowledge

`knowledge/` holds verified facts about this specific project — architecture, contracts, ownership, risk, testing commands. It never states an obligation ("must," "always," "never") — that's what the rule layer (`core/`, `agents/`, `workflows/`) is for. If a `knowledge/*` file starts prescribing behavior instead of describing what's true, that's drift from its job — fix it back to facts-only rather than leaving the rule duplicated in two places.

## Canonical Files

- `MANIFEST.md`
- `SETUP.md`
- `agents/architect.md`
- `agents/coordinator.md`
- `agents/implementer.md`
- `agents/product-manager.md`
- `agents/qa.md`
- `agents/reporter.md`
- `agents/reviewer.md`
- `config/autonomous-engineering.yaml`
- `core/autonomy-levels.md`
- `core/communication-contract.md`
- `core/constitution.md`
- `core/decision-framework.md`
- `core/engineering-rules.md`
- `core/evidence-policy.md`
- `core/operating-model.md`
- `core/safety.md`
- `core/task-lifecycle.md`
- `knowledge/README.md`
- `knowledge/architecture.md`
- `knowledge/api-contracts.md`
- `knowledge/db-contracts.md`
- `knowledge/environment.md`
- `knowledge/module-ownership-map.md`
- `knowledge/repository-map.md`
- `knowledge/risk-register.md`
- `knowledge/testing-strategy.md`
- `knowledge/test-plans/fe-campus-status-test-plan.md`
- `memory/architecture-decisions.md`
- `memory/lessons-learned.md`
- `memory/project-memory.md`
- `runtime/claude.md`
- `runtime/codex.md`
- `runtime/scheduler.md`
- `templates/adr.md`
- `templates/eod-report.md`
- `templates/execution-report.md`
- `templates/plan.md`
- `templates/pr-report.md`
- `templates/qa-report.md`
- `templates/rca-report.md`
- `templates/review-report.md`
- `templates/task.md`
- `validation/agent-contract-tests.md`
- `validation/auto-fix-prompt.md`
- `validation/bootstrap-check.md`
- `validation/repair-loop.md`
- `validation/workflow-tests.md`
- `workflows/blockers.md`
- `workflows/bug-fix.md`
- `workflows/context-refresh.md`
- `workflows/daily-cycle.md`
- `workflows/feature-development.md`
- `workflows/refactor.md`
- `workflows/release.md`
- `workflows/review-process.md`
- `workflows/task-intake.md`

## Extension Rule

Adding a new file to `.ai-engineering/` requires declaring it in this Canonical Files list in the same change. An undeclared file is a validation failure, not an oversight to fix later.

## Codex-leftover guard

This repo deleted its Codex-era AI-workflow layer on 2026-07-08 (`AGENTS.md`, `.codex/`, `CLAUDE_CODEX.md`, `.ai-scratchpad.md`, `.claude/settings.example.json`). If any of these reappear, flag and ask before silently deleting — do not assume it was intentional.
