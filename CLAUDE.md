# CLAUDE.md — DLSU Gate System Portal

Single-agent spec. Claude routes, investigates, plans, implements, and validates in one lane — no Codex, no split-brain, no `.ai-scratchpad.md` handoff. This file is both the operating contract and the (already-run) bootstrap source spec.

**Bootstrap status:** run on 2026-07-08. Repository auto-discovery, self-fill, and `docs/ai/*` generation are complete. Re-run only if asked to "refresh" or "re-bootstrap," or if the repo structure changes enough that `docs/ai/*` look stale (see Context Refresh Rule below). Skill Prerequisites re-runs on its own cadence via the marker file.

---

## Skill Prerequisites (Machine-Level) — status

Marker at `~/.claude/.skills-bootstrap-complete.json` confirms: `caveman` and `gstack` found at `~/.claude/skills/`; `ecc` found installed via plugin marketplace (`~/.claude/plugins/marketplaces/ecc`, `data/ecc-ecc`) rather than the `~/.claude/skills/ecc` directory layout the template assumed — counts as present. All three verified. Future sessions on this machine skip this check unless asked to re-verify.

---

## Session Start Protocol (every session, no exceptions)

1. Confirm the Skill Prerequisites marker above is present (it is — see status).
2. Invoke `caveman` at the **Ultra** setting immediately at the start of every session — unconditional, not gated by task type. It's the baseline reasoning mode for this repo.
3. Proceed to the Task Router.

---

## Identity

I am a capable developer who wants to understand the "why," not just copy-paste code. I learn by doing and asking questions. I push back when something doesn't feel right or scalable. Treat me as someone building real production software, not a tutorial project.

**Project:** DLSU Gate System Portal — a production university physical-access-control system. `apps/backend` (NestJS + TypeORM + PostgreSQL + Redis) syncs a student/employee roster from an external SQL Server source and a BioStar (Suprema) physical access-control device network, issues JWT-based auth, and logs every gate entry/exit decision. `apps/portal-web` (Next.js 15 + React 19) is the admin/employee dashboard: live gate-scan feed, reports, user management, and per-campus display behavior. One deployed instance = one campus (env-configured via `NEXT_PUBLIC_CAMPUS` / `SOURCE_DB_SCHEMA_ENV`). This is production infrastructure controlling real building/gate access — not a prototype `(inferred from the depth of BioStar/SQL-Server integration, deployment_docs_ws2022_prod/ Windows Server deployment scripts, and PM2 process management; please correct if this is actually still pre-launch)`.

## Communication Style — non-negotiable, every session

- Simple English. If a technical term is needed, always attach an analogy so I can visualize it.
- Before implementing anything, write a clear step-by-step plan and wait for my approval.
- Implement one step at a time — never jump ahead.
- After each step, explain what was built, why, which file, what each block does.
- If multiple valid approaches exist, state the tradeoff briefly and recommend one with a reason.
- Pause after each step, ask if I have questions before continuing.
- Mid-implementation question → stop, answer fully, then continue.
- If I push back, engage with the reasoning — don't just agree. Explain if I'm wrong, adjust if I'm right.
- Never say "for now" on anything with scalability implications.
- Keep code, paths, commands, API names, error strings exact — no paraphrasing technical specifics.

## How I Think About This Product

- **This system gates physical access.** A bug here can mean someone gets into (or is locked out of) a real building — treat `reports` (the access-decision log), `database-sync` (the BioStar/SQL-Server integration), and `auth` with the same caution as a safety system, not a typical CRUD app `(inferred from role of Report.status as GREEN/YELLOW/RED allow/deny decisions and database-sync's direct BioStar user provisioning/deprovisioning)`.
- **Auth here has real, already-identified gaps** — a dev-mode bypass that defaults unauthenticated requests to super-admin (`src/auth/jwt-auth.guard.ts`), a role-string casing bug that silently breaks `@Roles(Role.ADMIN)` checks for admin-issued tokens (`src/login/login.service.ts:108` vs `src/auth/enums/role.enum.ts`), and several endpoints (`AdminController`, `POST /super-admin/register`, `POST /database-sync/sync`) with no role guard at all beyond "any valid JWT." Don't assume auth/permission code here is correct just because it exists — verify against `docs/ai/risk-register.md` and the actual guard/role code every time.
- **The highest-risk module has the least test coverage.** `database-sync`, `auth`, `super-admin`, `users`, `students`, `sync`, `screensaver`, and `health` have zero unit tests. Deep tasks touching any of these must add tests as part of the task, not just run what exists.
- **Two live realtime channels feed the dashboard**: a Socket.IO `stats-update` stream (unauthenticated gateway) and a raw BioStar WebSocket device-scan stream — don't conflate them when debugging "live data" issues.
- **Mock mode and campus mode are both env-driven, both load-bearing.** `NEXT_PUBLIC_MOCK_MODE` short-circuits REST (via MSW) and both realtime paths directly in component code. `NEXT_PUBLIC_CAMPUS` / `SOURCE_DB_SCHEMA_ENV` change actual access-decision display logic (3-tier DASMA vs binary MTL) — a "cosmetic" change to `lib/access-status.ts` can change what counts as "allowed" on screen.

## Single-Agent Rule

Claude owns everything in this repo: task routing, RCA, code discovery, architecture analysis, feature discovery, implementation planning, actual code edits, tests, and validation commands. Nothing is hedged into a separate handoff file for another agent to pick up — plan, then implement, in the same thread, one step at a time per Communication Style above.

## Source of Truth Rule

Source of truth = real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, database definitions. Navigation docs (`docs/ai/*`) are maps only, never proof. If a map conflicts with code, code wins — say so out loud when it happens.

## UNVERIFIED DEPENDENCY Rule

If a migration, schema, contract, permission, or integration detail is unknown: mark `UNVERIFIED DEPENDENCY` and stop. Do not proceed to implementation until resolved. Do not guess on schema, permissions/isolation model, or public API shape.

---

# Bootstrap Source Contract

This file also governs what supporting files exist in this repo and what each must contain.

**Bootstrap outputs (Claude-only — no Codex artifacts):**

- `CLAUDE.md` — this file.
- `.claude/settings.json` — wires the `check-predict-verify.sh` hook (Claude Code's hook schema is verified/real, so the active file is used, not an example).
- `.claude/hooks/check-predict-verify.sh` — mechanical backstop for the Learning Contract. Blocks Edit/Write/MultiEdit calls on source files unless `.claude/.predict-verify-ack` exists and is fresh. Installed and validated 2026-07-08 (deny-without-ack, allow-with-fresh-ack, and doc-path-exemption all confirmed via dry run).
- `docs/ai/entry-point.md` — where a new session starts reading; single-agent workflow.
- `docs/ai/task-router.md` — task classification table.
- `docs/ai/architecture-manifest.md` — real system shape (Bun/Turborepo monorepo, NestJS+TypeORM+Postgres+Redis backend, Next.js 15 frontend), verified from source, not guessed.
- `docs/ai/module-ownership-map.md` — real domain → FE/BE/DB/tests/risk map (Auth/Sessions, Login, Admin, Super Admin, Users, Employee, Students, Reports, Sync, Database Sync, Screensaver, Health).
- `docs/ai/contracts/api-contracts.md` — real request/response shapes and known auth/permission gaps per endpoint.
- `docs/ai/contracts/db-contracts.md` — real TypeORM entities, invariants, mutation paths.
- `docs/ai/testing-strategy.md` — real verified commands (`bun run test`, `test:cov`, `test:e2e`, `check-types`, `lint` for each app) plus known coverage gaps.
- `docs/ai/risk-register.md` — project-specific Deep-by-default areas (Auth & Sessions, Database Sync/BioStar, Reports/Gate Log, Account Management, DB Migrations, External Integrations), grounded in cited code facts.
- `docs/ai/context-refresh.md` — workflow for refreshing stale context docs without touching source.
- `docs/ai/file-index/repository-map.md` — real symbol → file:line index, pre-populated from discovery.
- `docs/ai/prompts/bugfix-rca.md` — bug RCA template (unchanged — already single-agent-compatible).
- `docs/ai/prompts/bugfix-plan.md` — RCA-backed implementation plan template (Codex scratchpad section replaced with direct-implementation section).
- `docs/ai/prompts/feature-plan.md` — feature discovery + implementation plan template (same replacement).
- `docs/ai/prompts/refactor-plan.md` — behavior-preserving refactor plan template (same replacement).

**Codex/ChatGPT-era leftovers — flagged and deleted with explicit approval on 2026-07-08:** `AGENTS.md`, `.codex/` (`instructions.md`, `safety.md`, `local-workflow.md`), `.ai-scratchpad.md` (confirmed empty template before deletion), `CLAUDE_CODEX.md`, `.claude/settings.example.json` (superseded by the real `.claude/settings.json`), `docs/ai/codex-handoff.md`, `docs/ai/chatgpt-handoff.md`, `docs/ai/prompts/codex-task-prompt.md`, `docs/ai/prompts/chatgpt-planning-prompt.md`. If any of these reappear later (e.g. someone reintroduces a Codex workflow), flag and ask again rather than silently deleting.

**Preserved as-is (outside this bootstrap's required file set, not Codex-specific, left untouched):** `docs/ai/operating-principles.md`, `docs/ai/task-routing.md`, `docs/ai/hallucination-prevention.md`, `docs/ai/implementation-playbook.md`, `docs/ai/context-loading.md`, `docs/ai/risk-matrix.md`, `docs/ai/verification.md`, `docs/ai/rollback.md`, `docs/ai/test-plans/`, `docs/ai/workflows/`, `docs/ai/architecture/`, `docs/ai/file-index/{routes,controllers,models,src,hooks,utils,tests,services,components,stores}-index.md`, `docs/ai/prompts/{refactor-prompt,code-review-prompt,debugging-prompt}.md`. These predate this bootstrap and may overlap with the new required docs — if you find one actively contradicting a required doc, mark `CONTEXT DRIFT` and say so rather than silently trusting either.

### Hook Script Source — `.claude/hooks/check-predict-verify.sh` (already installed verbatim, do not regenerate)

The canonical source for this script lives in the original bootstrap template. If this file is ever missing or needs to be restored, copy it verbatim character-for-character from the template's "Hook Script Source" block — do not paraphrase or regenerate from the summary above; the stdin-parsing logic is load-bearing.

## Bootstrap Command Contract

**Manual/refresh trigger:** any later request to "refresh," "re-bootstrap," or "update the AI setup" →
1. Inspect the actual project tree again.
2. Detect existing AI setup files (including any remaining Codex artifacts from the flagged list above).
3. Produce a plan first: files to create, update, skip, or preserve — and any leftovers flagged for removal.
4. Wait for approval before writing, unless explicitly told "apply directly."
5. Generate/update only approved files, preserving project-specific content already in place.
6. Report a final Output Summary.

**Output summary must include:** what kind of project this was understood to be, files created, files updated, files skipped, existing content preserved, anything marked inferred/unverified that needs confirmation, verification performed, manual follow-up required, and the predict-verify hook validation result.

**Drift handling:** if generated setup files already exist, compare against this spec, preserve project-specific additions, update stale rules, don't remove useful local conventions, report what drifted and what was changed to realign.

**Rules during generation:** don't invent package scripts — verification commands must come from actual package scripts or repo docs. Don't create an active `.claude/settings.json` unless the Claude Code settings schema is verified (it is, for this environment — the PreToolUse hook schema is a documented, standard feature).

---

## Task Router

Classify every incoming request before acting — plain English, bug report, feature request, refactor, QA report, ticket, error log, whatever form it arrives in. Don't require me to name a lane.

| Input Intent | Workflow |
|---|---|
| Bug, error, regression, crash, failing test, broken/unexpected behavior, production incident | RCA first (`docs/ai/prompts/bugfix-rca.md`) |
| Approved RCA, request for fix plan | Bugfix Plan (`docs/ai/prompts/bugfix-plan.md`) |
| New capability, enhancement, new UI/API/product behavior | Feature Plan (`docs/ai/prompts/feature-plan.md`) |
| Cleanup, rename, restructure, no intended behavior change | Refactor Plan (`docs/ai/prompts/refactor-plan.md`) |
| Question, explanation, code review, architecture review, discovery only | Read-only — no plan needed |
| Docker, CI/CD, hosting/deployment config (this repo has Windows Server 2022 + PM2 deployment scripts under `deployment_docs_ws2022_prod/`) | Infra Plan — Deep by default, operational-verification checklist instead of unit-test-first |

**Ambiguity rule:** if unsure, pick the safest lane — possible bug → RCA, possible new behavior → Feature Plan, possible no-behavior-change → Refactor Plan, possible auth/permissions/database-sync/migrations/gate-access-logic → Deep by default.

After classifying, consult `docs/ai/module-ownership-map.md` for domain, likely FE/BE/DB areas, tests, and default risk. Missing → `UNMAPPED DOMAIN`. Stale or contradicts code → `CONTEXT DRIFT`.

Output classification before analysis:
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

## Task Size Classification

- **Tiny** — docs, copy, comments, config, display-only. No behavior change. Minimal verification.
- **Express** — single-layer, 1-2 files, no DB/schema/API contract change, low regression risk.
- **Standard** — multiple files or FE-BE coordination. Requires contract verification + targeted tests.
- **Deep** — high-risk/production-critical: **auth/roles/permissions/sessions, `database-sync` (SQL Server + BioStar integration), `reports` (gate access-decision log), account management (`admin`/`super-admin`/`users`), database migrations/TypeORM entities, screensaver upload (file I/O + ad hoc auth), production deployment.** Requires full RCA/discovery, my explicit approval before plan, regression tests, manual QA, rollback notes.

Only downgrade Deep if repo evidence proves the task is isolated and low-risk.

## Output Modes

**Read-only findings** — question, review, explanation, discovery. Evidence-backed only. No source edits.

**RCA / Discovery** — bug RCA or risky investigation. No implementation. Stop after RCA, wait for my approval before planning.

**Implementation** — after plan approval (Standard/Deep) or directly for Tiny/Express. Include exact files, exact changes, verification commands, manual QA, rollback/risk notes when relevant.

## Plan Format Contract

Every plan produced under Output Modes — Bugfix Plan, Feature Plan, Refactor Plan, Infra Plan — opens with a **TL;DR** section before anything else, including before the formal contract sections already required below (Issue Selected, Bug Summary, etc.).

TL;DR requirements:
- Plain English, no unexplained jargon.
- Lead with an analogy suited to the change — what is this like, in everyday terms?
- Include a small visualization (a short flow, a simple table, a before/after comparison) where it genuinely shortens the path to understanding. Skip it if the plan is small enough that a couple of plain sentences are already the fastest path.
- Answers, in a few lines: what's broken or needed, why, what's about to change, and what to expect once it's done.
- Compresses the plan for a fast skim — it does not replace the full detailed sections underneath.

## Bugfix RCA Contract

For bug reports, RCA first, no implementation steps yet. Required sections: Issue Selected, Bug Summary, Reproduction Flow From Code, FE/BE Investigation, FE-BE Contract Check (if applicable), Root Cause, Why Existing Code Allows The Bug, Eliminated Causes, Remaining Uncertainties, Confidence Level, Basic Solution Direction. Stop after RCA — wait for approval before planning implementation.

## Testing Requirement

Strict TDD, no exceptions — this is production infrastructure, not a prototype. Write the failing test first, confirm it fails, implement until it passes. Every touched file needs unit coverage; user-facing or cross-layer flows also need e2e coverage. Backend = Jest (`bun run test`, co-located `*.spec.ts`); frontend = Vitest (`bun run test`, `src/**/*.test.{ts,tsx}`). Missing tooling is not a reason to skip coverage — set it up first. Given the confirmed zero-coverage modules (`database-sync`, `auth`, `super-admin`, `users`, `students`, `sync`, `screensaver`, `health` on backend; hooks/middleware/auth-context/mock-handlers on frontend — see `docs/ai/testing-strategy.md`), a Deep task touching any of these must add tests as part of the task, not defer it. Implementation isn't complete until its tests exist and pass.

## Plan Execution Protocol

While an approved plan is being executed step-by-step, all of Claude's internal working-through-the-problem reasoning — the deliberation happening between "here's the plan" and "here's what got built" — runs at `caveman` Ultra: terse, self-directed, no padding, aimed squarely at the next concrete action.

This is separate from the Communication Style rule above. Everything actually shown to me — the plan itself, the per-step explanations, the "why" with an analogy — stays in plain English exactly as Communication Style requires. Caveman Ultra governs the internal thinking only, never the output I read.

## Post-Implementation QA Gate

TDD proves the code does what its test says. This gate proves the change actually works end-to-end.

- **FE + BE change:** always invoke gstack's `/qa` (or `/qa-only`) skill to verify the change across both layers before marking the step or plan done.
- **Backend-only change:** the unit tests for the change must explicitly cover five buckets: happy path, error cases, edge cases, rare/boundary edge cases, and optimization/performance-relevant cases. Coverage missing from any bucket counts as incomplete.
- If `/qa` or the unit test sweep turns up a failure, fix the bug and re-run the same check until it passes clean — never mark the step done on a red result.
- Mandatory for Standard and Deep tasks. For Tiny/Express, apply judgment but say so explicitly rather than silently skipping it.
- **Given this system's blast radius (physical gate access), lean toward running the full gate even on borderline Standard tasks touching `auth`, `reports`, or `database-sync`.**

---

## docs/ai — Navigation Map

Purpose: a fast map so Claude can find the right code without re-deriving architecture from scratch every session. These are maps, not truth — see Source of Truth Rule above.

### Context Order — consult before broad search

1. `docs/ai/task-router.md`
2. `docs/ai/architecture-manifest.md`
3. `docs/ai/module-ownership-map.md`
4. `docs/ai/contracts/api-contracts.md`
5. `docs/ai/contracts/db-contracts.md`
6. `docs/ai/testing-strategy.md`
7. `docs/ai/risk-register.md`
8. `docs/ai/file-index/repository-map.md`
9. related test suites
10. target source files

All of the above are maps only, never proof. Final conclusions must be verified against real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.

### Module Ownership Map Contract

`docs/ai/module-ownership-map.md` maps product/business domains to implementation areas. Map only — not proof of behavior.

Required columns:

| Domain | Frontend | Backend | Database / Schema | Jobs / Automations | Integrations | Tests | Risk | Notes |
|---|---|---|---|---|---|---|---|---|

**Starter domains** (real, from `apps/backend/src/`): Auth/Sessions, Login, Admin, Super Admin, Users (cross-entity directory), Employee, Students, Reports (gate access log), Sync (mobile/offline pull), Database Sync (external SQL Server + BioStar), Screensaver, Health.

**Default Deep domains:** Auth/Sessions, Login, Admin, Super Admin, Users, Reports, Database Sync — see `docs/ai/risk-register.md` for the cited reasons (dev-mode auth bypass, role-casing bug, missing role guards, unauthenticated WebSocket, external hardware credentials, zero test coverage on the riskiest modules).

Unknown implementation areas → `TODO: Fill after repository analysis. Do not treat as verified.` Claude uses this map before broad search when a task references a business/domain area, but still verifies all domain conclusions against real source code.

### Risk Register Contract

`docs/ai/risk-register.md` maps high-risk project areas so Claude classifies risky work as Deep and plans safer verification. Map only, not proof.

Required columns:

| Risk Area | Why Risky | Default Task Size | Required Checks | Manual QA | Notes |
|---|---|---|---|---|---|

**Starter risk areas** (real, from discovery): Auth & Sessions, Database Sync / BioStar Integration, Reports / Gate Access Log, Admin/Super-Admin/User Account Management, Database Migrations (auto-run on every boot in `main.ts`), External Integrations (SQL Server + BioStar).

If a task touches a listed high-risk area, default to Deep. Only downgrade if repo evidence proves the task is isolated and low-risk.

### Repository File Index (grep-avoidance rule)

`docs/ai/file-index/repository-map.md` exists specifically so Claude does not repeatedly grep/search the same symbols across sessions. It maps:

```
[symbol/function/class/component name] → path/to/file.ext:LINE — one-line purpose
```

**Rule:** before running grep/glob/broad search over the repo, check `docs/ai/file-index/repository-map.md` first. If the symbol is indexed there, jump straight to the file:line — no search needed. If it's stale (line number no longer matches, or symbol moved/renamed), fall back to search, find the real location, and correct the index entry in the same turn.

**Rule:** any time a new significant file, exported function, class, or component is created or moved, add/update its index entry in the same change.

This index is a map, not proof — always verify the actual file:line still matches before relying on it for anything beyond navigation. If it's wrong, that's `CONTEXT DRIFT` — fix it, don't just work around it silently.

### Context Refresh Rule

Context docs go stale. When Claude discovers verified source-code facts that contradict a generated context doc: mark `CONTEXT DRIFT` (or `CONTRACT DRIFT` for API/DB/test/risk docs), report the stale file and section, but do not update context docs unless I ask — use source code as truth for the current task in the meantime.

When I ask to refresh context, use `docs/ai/context-refresh.md`:
- Read-only for source code — only context docs may be edited.
- No implementation planning, no feature work during a refresh.
- Verify every fact against real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, database definitions.
- Update architecture manifest, module ownership map, repository map, API contracts, DB contracts, testing strategy, and risk register from verified evidence.
- Don't invent missing areas — mark unknowns `TODO: Fill after repository analysis. Do not treat as verified.`

## Documentation Sync Rule

Every code change updates the matching `docs/ai/*` entries in the same change — not deferred. Touch only the rows/sections the change actually affects. No existing entry for a touched area → add one instead of leaving `UNMAPPED`.

## Quality Gate

Before calling anything done:
- Contract areas identified or marked `No contract impact`.
- Risk register notes filled for Standard/Deep.
- API and DB/schema changes documented, or explicitly marked "none required."
- Verification commands confirmed from package scripts (never assumed) — see `docs/ai/testing-strategy.md`.
- Required unit/e2e tests listed and passing, TDD order.
- Post-Implementation QA Gate run and passing.
- Matching `docs/ai/*` entries updated.
- New/moved significant symbols reflected in `docs/ai/file-index/repository-map.md`.
- If this task matched the Learning Contract trigger: prediction was captured BEFORE implementation and `learnings.md` was updated after, or the skip was stated explicitly with which existing pattern it matched.
- Deep tasks: explicit approval confirmed before implementation.
- Types match established shared contracts.
- **Project-specific invariants that must always hold:** the `students` table mutation lock (`studentMutationLock` in `database-sync.service.ts`) is never bypassed — concurrent syncs must not race; BioStar deprovisioning failures must roll back the corresponding Postgres change (as `delete-users` already does — don't regress this); JWT role checks use the `Role` enum values consistently (don't reintroduce the `'ADMIN'` vs `'admin'` casing bug elsewhere); gate-access-decision writes to `reports` are never silently dropped.
- The "why" was explained, with an analogy, not just the "what."

## Guardrails

- No speculative architecture beyond the current step.
- No unrelated refactors bundled into a feature change.
- No new dependency without flagging it and stating why.
- No schema/migration change without explicit confirmation.
- Do not modify unlisted files. Do not rename public APIs unless explicitly discussed.

---

## Learning Contract (Predict → Verify) — mechanically enforced

A hook at `.claude/hooks/check-predict-verify.sh` blocks source-file edits unless `.claude/.predict-verify-ack` exists and is fresh (written within the current work turn). This forces the trigger decision below to actually happen every time.

**Trigger:** any new pattern, library, or design decision not already established elsewhere in this repo.

When triggered:
1. Stop before writing implementation code.
2. Ask me to write my prediction first — function signature guess, what could break it, expected approach.
3. Wait for my prediction.
4. Write `.claude/.predict-verify-ack` with `{"status":"triggered","note":"<what's new>"}`.
5. Implement.
6. Diff explicitly: where the real implementation differs from my prediction, and *why* (tradeoff, not just difference).
7. Append one entry to `learnings.md` at repo root, automatically, without being asked:
```
## [date] — [feature/module]
**Predicted:** [one line]
**Actual:** [one line]
**Why different:** [one line — tradeoff, not just diff]
```

**Skip trigger** for repetitive work matching an already-established pattern in this repo. Write `.claude/.predict-verify-ack` with `{"status":"skipped","matches":"<existing pattern>"}` and state explicitly: "skipping predict-verify — matches [existing pattern]." When unsure whether something counts as new, default to triggering.

---

## Skill Routing

`caveman` (Ultra) is always-on per the Session Start Protocol and Plan Execution Protocol above.

`gstack` and `ecc` are selected per-prompt, not always-on. Before invoking either, analyze the incoming request deeply enough to be genuinely confident it's the right fit — strict-fit, not lenient. More than one skill can be selected together when the request genuinely spans multiple domains, but each must independently clear the strict-fit check.

**gstack:**
- Product ideas/brainstorming → `/office-hours`
- Strategy/scope → `/plan-ceo-review`
- Architecture → `/plan-eng-review`
- Design system/plan review → `/design-consultation` or `/plan-design-review`
- Full review pipeline → `/autoplan`
- Bugs/errors → `/investigate`
- QA/testing site behavior → `/qa` or `/qa-only` (also mandatory post-implementation — see Post-Implementation QA Gate)
- Code review/diff check → `/review`
- Visual polish → `/design-review`
- Ship/deploy/PR → `/ship` or `/land-and-deploy`
- Save progress → `/context-save`
- Resume context → `/context-restore`
- Backlog-ready spec/issue → `/spec`
- New pattern/design decision worth internalizing → run the Learning Contract above
- All web browsing → `/browse`, never `mcp__claude-in-chrome__*` tools directly

**ecc (Everyday Claude Code):** installed via plugin marketplace (namespace `ecc:*`, e.g. `ecc:code-review`, `ecc:security-review`, `ecc:react-review`, `ecc:golang-testing`, `ecc:database-reviewer` agent, etc.). Given this repo's stack (NestJS/TypeORM backend, Next.js/React frontend), the relevant ones are the TypeScript/React/database reviewers and the security-review skill — reach for `ecc:security-review` specifically on anything touching `auth`, `database-sync`, or account-management given the already-identified gaps above. Read the live command list from the `ecc` plugin rather than trusting this note if it's ever in doubt.

## Design System

No `DESIGN.md`, Storybook config, or standalone style-guide file found in this repo — UI conventions live in `apps/portal-web/src/components/ui/` (shadcn/Radix primitives) and Tailwind config. Follow those existing patterns rather than introducing a new one; flag it if a UI task seems to need a real design-system doc and none exists yet.
