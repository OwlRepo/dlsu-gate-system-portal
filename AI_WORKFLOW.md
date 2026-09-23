# AI Software Engineering Workflow — pointer

The workflow is phase-loaded so a session pays only for the rules it needs at each step:

- Always-on core (Canonical Task Flow, core principles, stop conditions, caveman default, agent routing): `AGENTS.md`.
- Task routing, classification vocabulary and skill mappings: `docs/ai/task-router.md`.
- Plan-time rules (verification, deterministic spec, forbidden language, completion gate, migrations, Graphify, scans): `docs/ai/planning.md` + `docs/ai/plan-template.md`.
- Execute-time rules (worktree isolation, single-task rule, implementation, testing, review, QA): `docs/ai/execution.md`.
- Integration, completion gate, release flow, final report: `docs/ai/handoff.md`.
- Map of every doc: `docs/ai/entry-point.md`.

Role contracts, safety invariants and lifecycle states live in `.ai-engineering/`.
