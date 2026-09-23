# Planning Rules

> Purpose: every rule that governs WRITING a plan. Mandatory read before any plan.
> Load rule: read together with `docs/ai/plan-template.md` at flow node L. A plan written without both is invalid; its metadata must state `Docs loaded: planning.md, plan-template.md`.
> Source of truth: real code, tests, types, migrations, routes and `package.json` scripts always beat maps and prose.

## Docs-first, then repository verification

Before reading source for a new plan, check `docs/ai/` and `docs/` for existing answers. If a doc contradicts code, trust the code and fix the doc in the same change.

Then verify against the repository itself:

1. Search exhaustively: enumerate every call site, consumer, test, route, gateway event, migration and env var the change can reach, then inspect each. Verify every referenced path and symbol exists.
2. Search all usages of each symbol that will change.
3. Verify reusable modules, services, guards, hooks, components and helpers BEFORE proposing any new file or abstraction. If nothing is reusable, name the inspected candidates and why each fails.
4. Never guess file names, symbols, APIs, DB columns, env vars or patterns. Report missing files/symbols explicitly.
5. Every fact in a plan traces to a file/line actually read this session. Cite important facts as path + symbol + verified behaviour + why it matters.
6. A task depending on an unverified schema, permission model, backend↔frontend contract, or external integration (SQL Server source, BioStar API) is `UNVERIFIED DEPENDENCY` — stop and investigate before writing code that assumes it.

## Phases, model detection, and the switch stop

Every plan is cut into phases. Each phase names BOTH the model tier and the reasoning level (use `ecc:model-route` heuristics; it cannot detect the running model, so first state the model running the session from its own system context and assign tiers relative to it).

During execution, at the end of each phase compare the next phase's (model tier, reasoning level) pair with the current one:

- Identical pair → continue automatically, no confirmation stop.
- Different in either dimension → STOP, state the required switch, wait for the user.

## Plan format

Use the skeleton in `docs/ai/plan-template.md` exactly. Plans are deterministic: every step is a literal old-text/new-text block (or, for a new file, the complete new-file content) copied from the actual current repository content — never a prose description of the change. The executing model decides nothing that was decidable at plan time. Save the approved plan to `docs/plans/<branch-short-name>.md` before execution begins.

Prefer the simplest, most efficient correct solution — fewer moving parts, fewer new files, fewer new abstractions. Simple is not shallow: a fix that only covers the reported path is a band-aid; say so and plan the durable version. State any fact in exactly ONE place in the plan and reference it elsewhere.

### Forbidden language

Never use vague operations in a plan: "update component", "adjust layout", "modify styles", "preserve behavior" (without naming the behaviour and its proof), "where needed", "update consumers", "improve implementation", "if necessary", "etc.", "appropriate files", "relevant modules". This includes any prose paraphrase of a change when a literal old/new block is possible. Prose is only acceptable for genuinely new content with no "old" state.

### Plan completion gate

A plan is invalid until all are true:

- Every file path is explicit; every modified symbol is identified.
- Every code operation is a literal old/new block or full new-file content.
- Every dependency is listed; every new dependency is justified.
- Every acceptance criterion is mapped (criterion → file → symbol → step → validation).
- Every test is mapped (exact file, scenario, assertions — never "extend tests"), in the Test Matrix of `docs/ai/plan-template.md`.
- Every regression risk is mapped (file, symbol, reason, proving validation).
- Every new file is justified against verified reuse candidates.
- No forbidden language remains; no two steps restate or contradict the same fact.
- The chosen approach is the simplest correct one; a rejected simpler alternative is named with the reason.
- Every causal claim names the evidence FOR it and the observation that would DISPROVE it; an unfalsifiable cause is labelled a hypothesis. "Checked, not it" is recorded.
- Every measurement states what its metric divides by and why the sample is valid; fixed overhead amortised or reported apart; cache/warm-up state controlled.
- No gaps, no unverified items, no guesswork, no unsafe steps. Every open question is answered with a file/line or listed as a blocker.
- Every edge case and error case found is enumerated with its handling (file, function, branch).
- The four gate-access invariants (`.ai-engineering/core/safety.md`) are addressed explicitly whenever the plan touches `database-sync`, BioStar, auth/roles or `reports`.
- The plan carries a high-level SVG flowchart of problem/goal → solution (`docs/ai/plan-template.md` "Flowchart").

## Batch scheduling (multi-task plans)

Produce Parallel Group A, Parallel Group B, Sequential Tasks, and Merge Order. Only parallelize tasks that share no files, symbols, types, entities, endpoints or business logic. Merge order: shared foundations → entities/migrations → backend contracts → backend implementation → frontend consumers → dependent enhancements → independent fixes.

## TypeORM / PostgreSQL discipline

Every step that touches the database states:

- explicit selected columns or relations (no blind `find()` of wide entities in hot paths),
- a bound (`take`/`LIMIT`) on any query whose row count is not bounded by construction — `reports` grows with every gate event,
- no N+1: joins/relations or one batched query instead of per-row queries; independent reads with `Promise.all`,
- a transaction (`DataSource.transaction` / `QueryRunner`) where several writes must succeed together,
- student mutations go through `studentMutationLock` (`apps/backend/src/database-sync/database-sync.service.ts`); a BioStar deprovision failure rolls back the PostgreSQL change,
- cache impact: GET responses are cached by the global Redis-backed `HttpCacheInterceptor` (`docs/ai/architecture-manifest.md`) — state which cache keys go stale and how they are invalidated,
- anything that raises connection count (pool `max: 30` in `apps/backend/src/app.module.ts`), row scans, or external calls to the SQL Server source/BioStar — reduce it before implementation.

## Migrations (canonical rule)

Any plan including a TypeORM migration (`apps/backend/src/migrations/<timestamp>-<Name>.ts`) must satisfy ALL of:

- Additive and backward compatible: never modifies or removes existing data, never drops/renames tables or columns in a way that breaks code running against the old schema, never adds `NOT NULL` without a `DEFAULT`.
- Dependent code works WITHOUT the migration applied and seamlessly once applied; the plan names how each dependent path behaves pre-migration.
- A real `down()`; idempotent where PostgreSQL allows (`IF NOT EXISTS`); a unique timestamp.
- Destructive statements ONLY with Romeo's explicit approval recorded in the plan.
- A migration test, or a `Migration-Waiver:` naming the manual up/down verification (`docs/ai/testing-strategy.md` "Mandatory Test Layers").

How migrations are applied: `deployment_docs_ws2022_prod/deploy-monorepo.bat` runs `backup:db` then `migrate:backend` (`migration:run` against `apps/backend/src/config/data-source.ts`) on every deploy, before the build. A merged migration reaches production on Romeo's next `update-monorepo.bat` run. The backend also has `migrationsRun: true` in the canonical DataSource — see `docs/ai/architecture-manifest.md` for the three DataSource configs.

## Mandatory Graphify phase (every implementation plan)

### Graphify is the discovery tool

Finding things — where a symbol is used, what calls what, which module owns a file — goes through Graphify against `graphify-out/graph.json`: `/graphify query "<question>"`, `/graphify path "<a>" "<b>"`, `/graphify explain "<symbol>"`. `grep`/`Grep`/`rg` is a fallback for when Graphify cannot answer (literal string search, an unindexed file type, a stale graph). A plan that used grep names the Graphify query that failed and why. Copying a file's exact text for an old/new block is not discovery.

### Graphify closeout

Every implementation plan ends with a Graphify maintenance step: after the last change to any indexed source or document and before review, commit and handoff, load the `graphify` skill and run `/graphify . --update` from the repo root. Direct `graphify update .` is acceptable only for code-only changes (AST extraction only); docs changes follow the skill's semantic flow. Re-run after any later indexed edit or rebase that changes indexed files. A task is incomplete if the update is skipped, fails, or its graph diff and token-cost evidence are not reviewed. Changes produced solely by the update do not trigger a second update. `graphify hook install` supplements this gate but never replaces it.

Check `graphify --help` before choosing commands; report unsupported commands instead of emulating them. Token efficiency is mandatory: prefer the existing graph and incremental `--update`; use `query --budget`, `path`, `explain` or `affected` for narrow questions; `cluster-only` when extraction is unchanged; run only task-relevant exports. Report the exact command, changed-file count, graph diff, and semantic input/output tokens (actual counters, or a clearly labelled bounded estimate with its method).

## Closing scans (every plan)

- Optimization scan, scoped to what the plan touches: backward-compatible only; "not worth it, left as-is" is a valid answer.
- Cache scan: reuse the Redis cache (`@nestjs/cache-manager`, `HttpCacheInterceptor`) and the portal's zustand store before proposing a new caching mechanism; same honesty rule.
- UX outcome states (portal changes): loading, empty, error and success are acceptance criteria, not polish; live gate data shows when it is stale or disconnected.
