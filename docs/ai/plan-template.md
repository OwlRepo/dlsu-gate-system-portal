# Plan Template (canonical skeleton)

Every plan uses this exact structure. It satisfies the deterministic-spec rules in `docs/ai/planning.md` by embedding literal old-text/new-text blocks (or full new-file content) in each phase step. Read `docs/ai/planning.md` with this file before writing any plan. Save the approved plan to `docs/plans/<branch-short-name>.md` before execution.

Phase-stop rule: execution stops when the next phase's model tier or reasoning level differs from the current pair (`docs/ai/planning.md`). Identical pairs continue automatically.

---

## <Plan title>

<TL;DR: 2–4 plain-language sentences, led by an analogy (`.ai-engineering/core/communication-contract.md`). What's broken/needed (root cause in one sentence) and what will be built, understandable by a non-technical teammate.>

### Flowchart (high-level, SVG)

<One high-level flowchart: problem/goal on the left, solution shape on the right. Rendered inline for review via `mcp__visualize__show_widget` (English labels) and recorded here as a mermaid block. Boxes a non-technical reviewer can scan in seconds, never a per-file breakdown.>

### Task metadata

- Classification: `<Intent>` · `<Tiny|Express|Standard|Deep>` · <domain> · <risk>
- Docs loaded: `planning.md, plan-template.md` (mandatory canary — a plan missing this line is invalid)
- Claims reversed while investigating: <each claim asserted then disproved, and what disproved it — or "none">
- Root cause: <one sentence with file/symbol evidence> (bug fixes only)
- Gate-access invariants touched: <which of the four in `.ai-engineering/core/safety.md`, and how each is preserved — or "none">
- Detected running model: <model running this session>
- Recommended model: `<tier>`, <reasoning level>; fallback `<tier>`.
- Branch: `<fix|feat|enhancement|refactor|perf|infra|chore|docs>/<ticket-id|no-ticket>-<short-name>` (from `origin/main`)
- Release path: one branch → one PR into `main`, merge commit (`docs/ai/handoff.md` "Release flow").
- Required skills: </investigate, ecc:model-route, /qa, ecc:code-review, ...>
- Persona rounds: <per `docs/ai/agent-orchestration.md` "Round Structure", or "single persona: <name>">
- Execution preflight: `git fetch origin`, then `scripts/new-task-worktree.sh <type> <short-name>`.

### Phase 1 — RED (`<model>`, <reasoning>)

Write every test in the Test Matrix below, cases ordered `error:` > `edge:` > `regression:` > `happy:`; run `npm run tdd:red` and paste the failing output; commit the tests alone as `test(<scope>): ...`. No `apps/*/src` logic changes in this phase.

### Phase 2 — <title> (`<model>`, <reasoning>)

1. <Path. Then a literal "Old:" fenced block with the exact current text and a literal "New:" fenced block with the exact replacement — or, for a new file, one fenced block with the complete content.>
2. ...

Done: <objective, observable completion condition.>

### Phase N — ...

### Validation and acceptance

- **Test Matrix (mandatory):** one row per layer from `docs/ai/testing-strategy.md` "Mandatory Test Layers" — `layer | required / not required + reason | file | cases` (cases listed `error:` > `edge:` > `regression:` > `happy:`).
- Backend changes: the five buckets from `.ai-engineering/agents/qa.md` (happy, error, edge, rare/boundary, performance-relevant), each mapped to a test.
- Mock/seed data: per-task fixtures in the test itself (Jest/Vitest), or disposable rows in a local PostgreSQL for e2e — never a shared database.
- Run (real commands): `cd apps/backend && npx tsc --noEmit && npx eslint <files> && TZ=Asia/Manila npx jest <specs>`; `cd apps/portal-web && bun run check-types && bun run lint && npx vitest run <tests>`; `npm run test:scripts` when `scripts/` changed; `npm run tdd:gate` before the PR; build (`bun run build:backend` / `bun run build:web`) when the change can affect it.
- Graphify gate: `/graphify . --update` after the final indexed edit; report the graph diff and semantic tokens.

### Compatibility, docs, and scans

- <Behaviour preserved; migration backward-compat statement per `docs/ai/planning.md` "Migrations".>
- <`docs/ai/*` files updated in the same change (`docs/ai/handoff.md` "Docs sync").>
- <No forbidden language: every step is a literal old/new block or full new-file content.>
- Optimization scan: <opportunity or "not worth it, left as-is">.
- Cache scan: <Redis cache / zustand reuse or "not worth it, left as-is">.
- DB resource impact: <columns/bounds/round-trips/transactions; any connection or scan increase>.
- UX outcome states: <loading/empty/error/success plan, when the portal is touched>.

### Rollback

<Exact steps to revert: `git revert` of the merge commit; `migration:revert` if a migration shipped; any data repair.>

---

## Lane additions

- **Bug:** requires an approved RCA (`docs/ai/prompts/bugfix-rca.md`); steps map to confirmed RCA facts; name the regression test that fails on the pre-fix code.
- **Feature:** existing-system discovery first (does something similar exist? what is reused?); the migration danger gate — migration? backfill? default/nullability? index impact? existing data impact? rollback? deploy ordering? Any unknown → `UNVERIFIED DEPENDENCY`.
- **Refactor:** existing-behaviour proof and public API surface check (`.ai-engineering/workflows/refactor.md`); a signature change is `BREAKING CHANGE` and needs explicit approval; state `No API contract changes required.` / `No schema changes required.` otherwise.
