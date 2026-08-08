# Knowledge

This directory holds verified project **facts**, not rules. A file here never states an obligation ("must", "always do X") — it states an observation with a source-code citation ("`login.service.ts:108` signs `role:'ADMIN'`").

Rules live in `../core/`, `../workflows/`, and `../agents/`. Facts never override source code — if a map here conflicts with code, code wins, and the entry should be marked `CONTEXT DRIFT` (or `CONTRACT DRIFT` for `api-contracts.md`/`db-contracts.md`).

## Files

- `architecture.md` — project shape, frontend/backend stack, known drift and dead code
- `environment.md` — env vars, campus-mode pairing, dev command quick reference
- `module-ownership-map.md` — business domain → FE/BE/DB/tests/risk
- `api-contracts.md` — FE-BE contract index + known auth/permission gaps
- `db-contracts.md` — entity/table index + mutation invariants
- `repository-map.md` — symbol/area → file path index
- `risk-register.md` — high-risk areas, why, required checks
- `testing-strategy.md` — verified commands, coverage gaps (facts — the TDD/QA *rules* live in `../core/engineering-rules.md` and `../agents/qa.md`)
- `test-plans/` — per-feature test artifacts, does not duplicate `testing-strategy.md`

Migrated 2026-08-08 from `docs/ai/` during the move to `.ai-engineering/`. See `../MANIFEST.md` for the full file declaration and `../SETUP.md` for install history.
