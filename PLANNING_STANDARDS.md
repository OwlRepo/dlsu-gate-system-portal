# Planning Standards — pointer

Canonical planning rules live in:

- `docs/ai/planning.md` — verification, phases and the model/reasoning switch stop, TypeORM/PostgreSQL discipline, migrations (canonical), Graphify, scans, forbidden language, plan completion gate.
- `docs/ai/plan-template.md` — the canonical plan skeleton (TL;DR first, `Docs loaded:` canary, phase sections, validation, scans).

Both are MANDATORY reads before writing any plan (`AGENTS.md`, flow node L).

## Non-bypassable evidence gate

A plan may not assert a cause it has not tried to disprove. Every causal claim names the evidence for it AND the observation that would falsify it; anything unfalsifiable with the checks available today is labelled a hypothesis, not a cause. Every measurement states what its metric divides by and why the sample is valid for it — fixed overhead amortised or reported apart, cache state controlled. A claim asserted and later disproved is recorded in the plan's `Claims reversed while investigating` line, never silently replaced.

Canonical wording: `docs/ai/planning.md` "Plan completion gate"; the metadata line: `docs/ai/plan-template.md`.

## Non-bypassable Graphify gate

Every implementation loads the `graphify` skill and runs `/graphify . --update` after the final indexed source/document edit and before review, commit and handoff. Direct `graphify update .` is acceptable only for code-only changes because the CLI shortcut performs AST extraction only; docs changes follow the skill's semantic flow. A task is incomplete if the update is skipped, fails, or its graph diff and token-cost evidence are not reviewed. Full rule: `docs/ai/planning.md` "Mandatory Graphify phase".
