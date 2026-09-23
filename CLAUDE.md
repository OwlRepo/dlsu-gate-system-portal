@AGENTS.md

# CLAUDE.md — DLSU Gate System Portal

`AGENTS.md` (imported above) is the always-on workflow core: the Canonical Task Flow, core principles, agent routing and stop conditions. This file holds the project facts. If anything here contradicts the code, the code wins — fix this file in the same PR.

## What it is

A production university physical-access-control system. It gates real doors on a real campus: treat correctness the way a safety system demands, not a typical CRUD app.

- `apps/backend` (NestJS) syncs the student/employee roster from an external SQL Server source and the BioStar 2 (Suprema) device network, issues JWT auth, and logs every gate entry/exit decision in the `reports` table.
- `apps/portal-web` (Next.js) is the admin dashboard (reports, user management, settings) and the employee turnstile dashboard.

## Start here, every session

1. `AGENTS.md` — the Canonical Task Flow (auto-imported).
2. `.ai-engineering/core/constitution.md` and `.ai-engineering/core/safety.md` — principles and the four gate-access invariants.
3. `.ai-engineering/runtime/claude.md` — session start protocol, skill routing.
4. `docs/ai/entry-point.md` — the map of the phase docs and the project maps. Maps only, never proof: if a map conflicts with source code, source code wins.

## Tech stack (verified)

| Area | Fact | Evidence |
|---|---|---|
| Monorepo | Bun 1.2.22 workspaces + Turborepo | root `package.json` (`packageManager`, `workspaces`), `turbo.json` |
| Backend | NestJS 11, TypeORM, PostgreSQL, Redis (`cache-manager-redis-store`, `ioredis`), socket.io gateway, `@nestjs/schedule`, `mssql` for the SQL Server source | `apps/backend/package.json` |
| Backend tests | Jest 29 + ts-jest, `src/**/*.spec.ts`; e2e via `test/jest-e2e.json` | `apps/backend/package.json` `jest` block |
| Frontend | Next.js 15 App Router, React 19, Tailwind (`darkMode: ["class"]`), shadcn/Radix, axios, socket.io-client, zustand, react-hook-form + zod, MSW mock mode | `apps/portal-web/package.json`, `tailwind.config.ts` |
| Frontend tests | Vitest + Testing Library + jsdom, `src/**/*.test.{ts,tsx}` | `apps/portal-web/vitest.config.ts` |
| Env | One root `.env`, loaded by `scripts/run-with-root-env.mjs` for the portal | `scripts/run-with-root-env.mjs`, `.env.example` |
| Hosting | Windows Server 2022, one NSSM Windows service (`install-monorepo-service.bat`); legacy PM2 state is deleted on deploy. Deploy = `update-monorepo.bat` → `git pull origin main` → `deploy-monorepo.bat` (install, env/DB checks, DB backup, `migrate:backend`, build, service install/start) | `deployment_docs_ws2022_prod/` |
| CI | None. No `.github/`; `apps/backend/Jenkinsfile` only triggers `POST /database-sync/sync` on a cron | repo tree |
| Discovery | graphify graph in `graphify-out/` (tracked) | `graphify-out/graph.json` |

System map: `docs/ai/architecture-manifest.md`. Domains and risk: `docs/ai/module-ownership-map.md`, `docs/ai/risk-register.md`.

## Non-negotiables

- **Source of truth is code, not docs.** `docs/ai/*` are maps; verify against real source before relying on them for a Deep task.
- **Four gate-access invariants** (`.ai-engineering/core/safety.md`): `studentMutationLock` is never bypassed; a BioStar deprovision failure rolls back the PostgreSQL change; JWT role checks use the `Role` enum (`apps/backend/src/auth/enums/role.enum.ts`), never a string literal; gate-access writes to `reports` are never silently dropped.
- **Strict TDD + the five-bucket QA gate** on every change: `docs/ai/testing-strategy.md` "Strict TDD", `.ai-engineering/agents/qa.md`.
- **Plan before implementing; approval before execution** (`AGENTS.md` nodes L and R). Plans open with a plain-English TL;DR and an analogy (`.ai-engineering/core/communication-contract.md`).
- **Persona dispatch** — the main session orchestrates the generated personas in `.claude/agents/` per `docs/ai/agent-orchestration.md`; the `.ai-engineering/agents/` roles are the contracts they follow (`.ai-engineering/core/operating-model.md`).

## Conventions

- TypeScript strict, no `any`.
- Backend: one Nest module per domain (`controller` + `service` + `dto/` + `entities/`). DTOs validated with class-validator; **no global `ValidationPipe`** is registered in `apps/backend/src/main.ts`, so each endpoint applies one explicitly (pattern: `apps/backend/src/users/users.controller.ts`).
- Backend auth: the global `JwtAuthGuard` lives in `apps/backend/src/auth/jwt-auth.guard.ts` (`apps/backend/src/auth/guards/jwt-auth.guard.ts` is a dead stub); role checks via `RolesGuard` + `@Roles(Role.X)`.
- Frontend: reuse `src/components/ui` (shadcn), `src/lib/access-status.ts` / `src/lib/campus-mode.ts` for gate status mapping, `src/hooks/use-toast.ts` for feedback. Every data view has loading, empty, error and success states.
- Backend Jest runs need `TZ=Asia/Manila` (the Dasma specs pin the clock): `docs/ai/testing-strategy.md`.
- Comments explain why, never what.

## Database rules

- Migrations are TypeORM classes in `apps/backend/src/migrations/<timestamp>-<Name>.ts`; the canonical DataSource is `apps/backend/src/config/data-source.ts` (`synchronize: false`).
- Every deploy applies pending migrations automatically after a DB backup (`deploy-monorepo.bat`), so a migration reaches production on the next deploy.
- Additive and backward compatible only; destructive statements need Romeo's explicit approval. Canonical rule: `docs/ai/planning.md` "Migrations".
- Entity/table index and mutation invariants: `docs/ai/contracts/db-contracts.md`.

## How agents operate

- **Never commit to `main`.** One task = one branch + worktree from freshly fetched `origin/main` (`scripts/new-task-worktree.sh <type> <short-name>`, under `.claude/worktrees/`). The pre-commit hook in `scripts/git-hooks/` blocks commits on `main`; it activates on `bun install` (`prepare` script).
- **Release flow:** one branch → one PR into `main`, "Create a merge commit". There is no dev/stg. Canonical: `docs/ai/handoff.md` "Release flow".
- **No CI and no branch protection** (`main` is unprotected — verified via the GitHub API): run `npm run tdd:gate` and the full validation locally and paste the output into the PR. Nothing else stops a red PR.
- **Deploy is Romeo's**, by hand on the Windows server. Agents never deploy.
- **Personas:** `agents/src/*.agent.mjs` → `npm run agents:generate` → `.claude/agents/`. Never hand-edit the generated files; `npm run agents:lint` fails on drift.
- **The repo is public.** Nothing in code, docs, fixtures or PR text may expose credentials, hostnames or personal data.

## Don't

- Don't bypass or reimplement `studentMutationLock`, the token blacklist, or the access-status mapping — reuse them.
- Don't compare roles as strings (`'ADMIN'` vs `'admin'` at `apps/backend/src/login/login.service.ts:108` is the reason).
- Don't swallow errors on gate-event, BioStar or SQL Server paths.
- Don't add a dependency without justifying it in the plan.
- Don't run `bun install` inside a worktree whose `node_modules` is symlinked (it writes through the link).
- Don't edit `.claude/settings.local.json` or any `.env*`.

## Agent skills

### Issue tracker

Linear — issues come from raised concerns or meeting follow-ups; agents treat them as Romeo's todos and always run planning triage first. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context — `apps/backend` and `apps/portal-web` are separate domains, each with its own `CONTEXT.md`. See `docs/agents/domain.md`.

## Inventory and leftovers

- `.ai-engineering/MANIFEST.md` is the authoritative file list for `.ai-engineering/`; `docs/ai/entry-point.md` maps `docs/ai/`.
- Codex is not used in this repo (decided 2026-09-23). If `.codex/`, `CLAUDE_CODEX.md`, `.ai-scratchpad.md` or `.claude/settings.example.json` reappear, flag it and ask before assuming it was intentional (`.ai-engineering/MANIFEST.md` "Codex-leftover guard"). `AGENTS.md` is intentional: it is the workflow core imported above.
