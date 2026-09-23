# Codex Runtime Rules

Codex is not used in this repo (confirmed 2026-09-23 during the workflow port: no `.codex/` personas are generated). If it is ever reintroduced, `../AGENTS.md` is already its entry file, `../scripts/generate-agent-defs.mjs` would need a Codex renderer again, and these rules apply.

Codex should:

- read repository instructions first
- inspect before editing
- use assigned persona
- keep tasks isolated
- provide structured evidence
- create focused changes
