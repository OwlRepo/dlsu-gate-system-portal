# Agent Orchestration

> Purpose: how the main session dispatches the generated personas for one task, what each persona may touch, and the domain briefings injected into dispatch prompts.
> Load rule: read when a spec touches both `apps/backend` and `apps/portal-web`, or needs an entity/migration, before dispatching anyone.
> Source of truth: this is a MAP. `agents/src/*.agent.mjs` (generated into `.claude/agents/*.md` by `npm run agents:generate`) is the executable source. If this doc and a generated file disagree, the generated file wins — fix this doc in the same change. `scripts/generate-agent-defs.test.mjs` fails if an owned glob below goes undocumented.

## Runtime model

All nine personas are Claude Code subagents on the `sonnet` model alias, with the shared `GLOBAL_POLICY` (caveman ultra, stack persona, the four invariants, Strict TDD, Canonical Task Flow) appended by `scripts/generate-agent-defs.mjs`. Edit the policy in the generator, never in `.claude/agents/`. Codex is not used in this repo.

A Claude Code subagent cannot spawn another subagent. The **main session is the orchestrator**: `project-manager` returns the spec, the locked contract and the round plan; the main session runs the rounds.

## File Ownership Rule (backend + frontend personas, same worktree)

For one dispatch, `nestjs-backend-dev` and `nextjs-frontend-dev` work in the SAME worktree. To prevent concurrent writes to the same file:

1. **`nextjs-frontend-dev`** owns `apps/portal-web/src/**`: pages and route handlers under `src/app`, components, hooks, `src/lib`, `src/store`, MSW mocks, and portal tests.
2. **`nestjs-backend-dev`** owns `apps/backend/src/**` EXCEPT the two globs owned by `database-architect` (rule 3): controllers, services, DTOs, guards, gateways, `database-sync`, and backend specs. The backend DTO is the locked contract; the frontend mirrors its shape in portal types and never edits backend files.
3. **`database-architect`** owns `apps/backend/src/migrations/**` and `apps/backend/src/**/entities/**`. It runs ALONE, before the contract lock (Round 0), never in the concurrent round. The narrower globs win over rule 2's broader one.
4. **`test-engineer`** writes the RED tests in Round 1b before either implementer starts; implementers may add tests afterwards but never weaken a RED test.
5. Anything not covered (root `scripts/`, `deployment_docs_ws2022_prod/`, `.ai-engineering/`, `docs/`) is done by the main session, never mid-flight by a persona.
6. If a spec would need two personas to touch the same file, the spec is defective: split it or assign that file to one owner before dispatch. The main session catches this at contract lock.

## Round Structure (mandatory when a spec crosses backend and frontend)

- **Round 0** (only if an entity/migration changes): `database-architect` alone. Wait for it.
- **Round 1:** `project-manager` produces the spec and locks the contract: route, method, `@Roles(Role.X)`, request DTO with class-validator rules, response shape, error statuses, socket events if any.
- **Round 1b — RED:** `test-engineer` alone, with the contract and the plan's Test Matrix. It writes the tests (`error:` > `edge:` > `regression:` > `happy:`), runs `npm run tdd:red`, commits `test(<scope>): ...`, and reports the failing output. Round 2 does not start until that RED is recorded (`docs/ai/testing-strategy.md` "Strict TDD").
- **Round 2:** `nestjs-backend-dev` and `nextjs-frontend-dev` together (parallel Agent calls in one message), each prompt carrying the File Ownership Rule above verbatim and the matching Domain Briefing(s).
- **Round 3:** the main session verifies the combined diff against the locked contract and every acceptance criterion itself — not a persona's self-report.
- **Round 4 — QA fan-out (the one canonical roster):** `test-engineer`, `code-reviewer`, `security-auditor` together, always. Add `accessibility-auditor` when the diff touches portal UI; add `ui-ux-designer` when it touches UI copy or flows. Browser/manual QA uses the `/qa` skill directly — it is a skill, not a persona.

Backend-only or frontend-only changes skip the parallel half of Round 2 but keep Rounds 1, 1b, 3 and 4.

## Domain Briefings

Keyed by the domains in `docs/ai/module-ownership-map.md`. The main session copies the matching section(s) verbatim into the "## Domain Briefing" block of every Round 2 dispatch prompt, chosen by the file paths the spec touches. Content comes from the ownership map and `docs/ai/risk-register.md` — do not invent facts here.

### auth / login (`apps/backend/src/auth/`, `apps/backend/src/login/`)
Deep. Global `JwtAuthGuard` (`apps/backend/src/auth/jwt-auth.guard.ts`) with a dev-mode bypass that fabricates a SUPER_ADMIN user when `NODE_ENV=development` and no token is sent. 2-day tokens, no refresh; one active token per (userId, role) via the token blacklist. Known bug: `apps/backend/src/login/login.service.ts:108` signs admin tokens with `role: 'ADMIN'` while `Role.ADMIN` is `'admin'`. Never compare roles as strings.

### account management (`apps/backend/src/admin/`, `apps/backend/src/super-admin/`, `apps/backend/src/users/`, `apps/backend/src/employee/`; portal `src/app/user-management`, `src/components/users`)
Deep for admin/super-admin/users, Standard for employee. `AdminController` has no role guard; `POST /super-admin/register` has no role check; some super-admin routes do manual in-controller role checks. Bulk deactivate/reactivate uses `@Roles(SUPER_ADMIN, ADMIN)` and is affected by the role-casing bug.

### database-sync (`apps/backend/src/database-sync/`)
Deep — highest-risk module: bulk PII/photo sync from the SQL Server source to PostgreSQL and BioStar. Every student mutation goes through `studentMutationLock`; a BioStar deprovision failure rolls back PostgreSQL. `POST /database-sync/sync` and `/database-sync/biostar/sync` have no role guard (JWT only). Writes plaintext audit logs under `logs/`. Scheduled via `@nestjs/schedule` and triggered by the Jenkins cron (`apps/backend/Jenkinsfile`).

### reports / gate events (`apps/backend/src/reports/`; portal `src/app/reports`, `src/components/reports`, `src/hooks/useReportSocket.tsx`)
Deep. The `reports` table is the access-decision log (GREEN/YELLOW/RED); a dropped write is an unrecorded gate event. `ReportsGateway` (socket.io) has no auth guard. Status mapping in the portal: `src/lib/access-status.ts`, `src/lib/campus-mode.ts`.

### students roster (`apps/backend/src/students/`)
Standard. No direct portal surface; consumed by gate hardware/mobile clients through the sync domain. Mutations serialized by `studentMutationLock`.

### sync — mobile/offline pull (`apps/backend/src/sync/`)
Standard. Read-only pull endpoints (non-archived students, active employees without passwords).

### screensaver (`apps/backend/src/screensaver/`; portal `src/components/settings/screen-saver-upload.tsx`)
Standard, Deep when upload handling changes. Multipart upload, 10 MB limit, manual in-service super-admin check instead of `RolesGuard`.

### employee dashboard (portal `src/app/employee-dashboard`, `src/components/employee-dashboard`)
Standard. Turnstile dashboard fed by the reports socket.

### health (`apps/backend/src/health/`)
Express. `GET /health` inherits the global `JwtAuthGuard` with no `@Public()`.

If a spec touches a domain not listed here, do not invent a briefing — escalate to Romeo.
