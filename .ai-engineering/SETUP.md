# Autonomous Engineering Bootstrap Setup

## Install Record

Installed 2026-08-08, replacing the prior `CLAUDE.md` + `docs/ai/` setup. Migration approved via the plan at `.claude/plans/check-the-autonomous-engineering-md-pack-quizzical-petal.md` — read it for the full rationale, migration mapping, and conflict resolutions. Project knowledge (`knowledge/`) was migrated verbatim from `docs/ai/`; the rule layer (`core/`, `agents/`, `workflows/`, `templates/`, `memory/`, `runtime/`, `config/`) was adapted from the generic `autonomous-engineering-md-package/` scaffold to carry forward this project's real rules (strict TDD + QA gate, gate-access invariants, communication style + caveman Ultra). The predict-verify Learning Contract hook was deliberately dropped, not carried over.

The workflow below is preserved because it's still valid for a future re-bootstrap or refresh — not because this repo needs first-time install again.

Goal:
Install an AI engineering operating layer into an existing repository.

Read all files in this package before making changes.

Setup workflow:

1. Inspect repository:
   - stack
   - architecture
   - existing instructions
   - testing
   - deployment
   - integrations

2. Create:
   .ai-engineering/

3. Install:
   - agents
   - workflows
   - templates
   - memory structure
   - configuration

4. Preserve existing project rules.

5. Do not modify application code during setup.

6. Report:
   - detected project information
   - installed workflow
   - configured agents
   - automation recommendations
   - unresolved decisions

This package defines behavior. Runtime execution is handled by Codex, Claude, or another compatible agent runtime.

## Post-Setup Validation

After installing `.ai-engineering/`:

1. Run the bootstrap validation workflow:
   - Read `validation/bootstrap-check.md`
   - Run all workflow tests
   - Validate agent contracts
   - Check templates and references

2. If issues are found:
   - Read `validation/repair-loop.md`
   - Fix only Markdown and configuration files inside the newly installed `.ai-engineering/` directory
   - Do not modify application code, dependencies, database files, infrastructure, deployment configuration, or external systems

3. Re-run validation.

Setup is complete only when:

- validation passes
- no unresolved workflow conflicts exist
- safety rules remain intact

## Canonical Package Inventory

Read `MANIFEST.md` before installation and validation. It defines the one
canonical file for each responsibility. Do not create duplicate rules or
workflows with alternate names.
