# Architecture Manifest

Purpose:

Navigate and understand system structure before detailed file inspection.

This file is map only.

It is not proof of behavior.

Verify all conclusions against real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.

If this map conflicts with source code, source code wins.

Mark stale or conflicting entries as `CONTEXT DRIFT`.

## Project Shape

Bun 1.2 + Turborepo monorepo (root `package.json` orchestrates `apps/*` via `turbo`).

- **`apps/backend`**: NestJS + TypeORM + PostgreSQL API server.
- **`apps/portal-web`**: Next.js 15 (App Router) + React 19 admin/reporting portal.
- No shared `packages/` workspace confirmed — `TODO: Fill after repository analysis. Do not treat as verified.` if one is added later.
- Deployment targets: `TODO: Fill after repository analysis. Do not treat as verified.` (on-prem gate hardware integration suggests on-prem or hybrid deployment, not pure cloud SaaS — not independently confirmed).

## Frontend

- **Stack**: Next.js 15 (App Router), React 19, Zustand, Tailwind + Radix UI, react-hook-form + zod, axios, socket.io-client, MSW (mock mode).
- **Entry point**: `apps/portal-web/src/app/layout.tsx` (`RootLayout`), which mounts `MockModeProvider` (`components/providers/mock-mode-provider.tsx`) at the top of the tree.
- **Routes** (`src/app/*`): `/` (root dashboard render), `/dashboard` (server component, redirects to `/login` if no `user` cookie via `getUser()` in `src/app/actions/auth.ts`), `/employee-dashboard` (TurnstileDashboard), `/login`, `/login/admin`, `/login/employee` (shared `LoginForm`), `/reports` (`ReportsPageContainer`), `/settings` + `/settings/operation`, `/user-management` (client-only, dynamic import `ssr:false`), `/about`, `/wstest` (dev-only BioStar WS test harness, not a product route).
- **Route handlers**: `/api/login`, `/api/devices`, `/api/events`, `/api/users` — same-origin HTTPS proxies to the on-prem BioStar 2 device server (bypass TLS verification, forward `bs-session-id` header).
- **State management**: single Zustand store `src/store/gateStats.ts` (`useGateStatsStore`), persisted to `localStorage` key `gate-stats`.
- **Mock mode**: `lib/mock-mode.ts` `isMockMode()` reads `NEXT_PUBLIC_MOCK_MODE`; when true, `MockModeProvider` dynamically starts an MSW `setupWorker` (`src/mocks/browser.ts` + `src/mocks/handlers/*` + `src/mocks/data/*`) and both realtime channels (see Jobs/Automations) branch to fake data instead of opening real connections.
- **Campus-aware config**: `lib/campus-mode.ts` `getCampusMode()` reads `NEXT_PUBLIC_CAMPUS` (MAIN/TAFT/LAGUNA → `"MTL"`, else `"DASMA"`). `lib/access-status.ts` `getAccessStatus()` forks: DASMA = 3-tier GREEN/YELLOW/RED with remarks; MTL = binary Allowed/Not-Allowed, remarks always hidden. This is a deploy-time config — one deployed instance serves one campus, paired with backend env `SOURCE_DB_SCHEMA_ENV`.
- **Testing**: Vitest (`apps/portal-web/vitest.config.ts`, jsdom, setupFiles `src/test/setup.ts`). See testing-strategy.md for coverage gaps.
- **Build tools**: Next.js build pipeline via `bun run build` (turbo-orchestrated).

## Backend

- **Stack**: NestJS + TypeORM + PostgreSQL + Redis (cache/session support).
- **Entry point**: `apps/backend/src/main.ts` — boots `AppDataSource` (`src/config/data-source.ts`) and runs migrations automatically on every boot; registers `JwtAuthGuard` as a GLOBAL guard (`app.useGlobalGuards`) so every route requires JWT unless `@Public()`; CORS wide open (`origin: '*'`); Swagger at `/api/docs`; NO global `ValidationPipe` (most DTOs unvalidated); rate limit 1000/15min; static serving of `persistent_uploads/`.
- **Root module**: `apps/backend/src/app.module.ts` — `TypeOrmModule` (Postgres, `synchronize: false`, `autoLoadEntities: true`), feature modules: `EmployeeModule`, `ReportsModule`, `LoginModule`, `AdminModule`, `UsersModule`, `SuperAdminModule`, `HealthModule`, `DatabaseSyncModule`, `CacheModule` (redis), `AuthModule`, `StudentsModule`, `SyncModule`. Global `HttpCacheInterceptor` (Redis-backed GET cache).
- **API route structure / service layer**: one controller+service+entity trio per domain module — see `module-ownership-map.md` for the full domain list and `contracts/api-contracts.md` for the full route inventory.
- **Error handling / logging**: `TODO: Fill after repository analysis. Do not treat as verified.` (no centralized exception filter or logger confirmed beyond default Nest behavior; database-sync writes plaintext audit logs to `logs/skipped-records`, `logs/synced-records`, `logs/photo-conversion`).
- **Testing frameworks**: Jest for unit tests (`*.spec.ts` co-located under `src/`), Jest for e2e (`test/jest-e2e.json`).
- **Database ORM/query layer**: TypeORM. **CONTEXT DRIFT candidate / dead-code note**: three inconsistent DataSource configs exist — `src/config/data-source.ts` (canonical, used by `migration:*` npm scripts and `main.ts` boot), `src/data-source.ts` at root (unused duplicate), `src/config/typeorm.config.ts` (used by `typeorm:*` scripts), `src/config/database.config.ts` (dead/unused). Always verify which config a given script actually loads before assuming they're in sync.

## Database / Schema

- **Database type**: PostgreSQL, accessed via TypeORM.
- **Schema location**: entity classes under each domain module (`apps/backend/src/<domain>/entities/`).
- **Migration strategy**: `src/migrations/` (20 files as of last discovery), auto-run on every backend boot via `main.ts` → `AppDataSource`. A duplicate migration file (`AddActivationColumnsToUsers`) exists twice — flagged as known drift, see below.
- **Key models/tables**: `admin`, `super-admin`, `employee`, `students`, `reports`, `token_blacklist`, `sync_schedule`, `sync_queue`, `biostar_sync_state`. Full field-level detail in `contracts/db-contracts.md`.
- **Relationships / constraints**: `TODO: Fill after repository analysis. Do not treat as verified.` — no FK relationship diagram confirmed; several tables (e.g. `students`, `reports`) appear to reference other domains by loosely-typed id/name fields rather than TypeORM relations. Verify against entity decorators before assuming referential integrity is enforced at the DB level.

## API Contracts

- **Authentication method**: JWT bearer tokens, validated by a GLOBAL `JwtAuthGuard` (`src/auth/jwt-auth.guard.ts`) applied to every route unless annotated `@Public()`.
- **Authorization model**: role-based, intended to be enforced via `RolesGuard` (`src/auth/guards/roles.guard.ts`) + `@Roles()` decorator, backed by `Role` enum (`USER`, `ADMIN`, `SUPER_ADMIN`, `EMPLOYEE`) in `src/auth/enums/role.enum.ts`. **Inconsistently applied in practice**: `AdminController` has no role guard at all; `SuperAdminController`'s `/register` has no role check; several `SuperAdminController` routes do manual in-code role checks instead of using `RolesGuard`; `DatabaseSyncController`'s `/sync` and `/biostar/sync` skip the role guard while sibling routes on the same controller use it correctly. See `contracts/api-contracts.md` "Known Auth / Permission Gaps" for the full cited list.
- **Standard response / error format**: `TODO: Fill after repository analysis. Do not treat as verified.` (no confirmed global exception filter or response envelope).
- **API versioning strategy**: none confirmed — routes are unversioned (`/admin`, `/employee`, etc., no `/v1` prefix).
- **Pagination strategy**: `TODO: Fill after repository analysis. Do not treat as verified.`

## Auth / Permissions

- **User model structure**: no single unified "User" entity — separate `admin`, `super-admin`, and `employee` entities/tables, each with its own login path, unified only at the JWT-role level.
- **Authentication flow**: `POST /auth/login` (admin/super-admin) or `POST /auth/employee` (employee) → `src/login/login.service.ts` issues a JWT. Frontend stores the token in a cookie via `js-cookie` (`lib/auth-context.tsx`), not localStorage.
- **Authorization rules**: `RolesGuard` + `@Roles()` is the intended enforcement mechanism; see gaps above for where it's missing or bypassed with manual checks.
- **Role/permission model**: flat role enum — `USER`, `ADMIN`, `SUPER_ADMIN`, `EMPLOYEE` (`src/auth/enums/role.enum.ts`). No granular permission system beyond role.
- **Token strategy**: JWT via `src/auth/strategies/jwt.strategy.ts` (the real strategy; `src/auth/jwt.strategy.ts` is a dead duplicate — see Known Drift below).
- **Token expiration and refresh**: 2-day expiry (`expiresIn: '2d'`), no refresh endpoint. Session model enforces a single active token per (userId, role) via `src/auth/token-blacklist.service.ts` + `token_blacklist` table (Redis-backed, in-memory Map fallback if Redis is down).
- **Known bug**: `src/login/login.service.ts:108` signs admin JWTs with `role: 'ADMIN'` (uppercase literal) while `Role.ADMIN` = `'admin'` (lowercase) — breaks `@Roles(Role.ADMIN)` checks for admin-issued tokens (only super-admin-issued tokens use correct casing).
- **Dev-mode bypass**: `src/auth/jwt-auth.guard.ts` fabricates `request.user` with role `SUPER_ADMIN` when `NODE_ENV=development` and no token is present — be aware of this when reasoning about "unauthenticated" behavior in local dev.

## Jobs / Automations

- **Scheduling system**: `cron` package + Nest `SchedulerRegistry`, used by `src/database-sync/` for roster/BioStar sync jobs. Timezone hardcoded to `Asia/Manila`. Default schedules 09:00/21:00, configurable via `sync_schedule` table and `/database-sync/schedule*` endpoints.
- **Background job types**: (1) scheduled full roster sync from external SQL Server, (2) BioStar hardware enrollment/photo push-pull sync, (3) manual sync triggered via `DatabaseSyncQueueService` + `sync_queue` table.
- **Concurrency control**: global async mutex `studentMutationLock` serializes all mutations to the `students` table across all sync paths.
- **Retry strategy / failure handling**: `TODO: Fill after repository analysis. Do not treat as verified.` beyond the confirmed rollback behavior on `/database-sync/delete-users` (archives in Postgres then deletes from BioStar, rolls back Postgres archive on BioStar failure).
- **Realtime polling (not a queue job, but automation-adjacent)**: `ReportsGateway` (`src/reports/reports.gateway.ts`) polls every 1 second via `@Interval` and emits a `stats-update` Socket.IO event with no auth guard.

## Verification Commands

Verified from `apps/backend/package.json`, `apps/portal-web/package.json`, and root `package.json`. Full detail (including known gaps) in `docs/ai/testing-strategy.md`.

```
Backend (apps/backend):
  Build:          bun run build
  Dev:            bun run dev
  Type checking:  bun run check-types   (tsc --noEmit)
  Linting:        bun run lint          (eslint --fix)
  Unit tests:     bun run test          (jest, *.spec.ts under src/ — only 5 of 12+ modules covered)
  Coverage:       bun run test:cov
  E2E tests:      bun run test:e2e      (jest-e2e, 1 spec, likely stale)

Frontend (apps/portal-web):
  Build:          bun run build
  Dev:            bun run dev
  Type checking:  bun run check-types
  Linting:        bun run lint
  Unit tests:     bun run test          (vitest run — only campus-mode/access-status area covered)
  Coverage:       bun run test:coverage

Root (turbo-orchestrated):
  Build:              bun run build
  Dev:                bun run dev
  Dev backend only:   bun run dev:backend
  Dev web only:       bun run dev:web
  Build backend only: bun run build:backend
  Build web only:     bun run build:web
  Lint:               bun run lint
  Type checking:      bun run check-types
  Env verify backend: bun run verify:env:backend
  Env verify web:     bun run verify:env:web
```

## Known Drift / Dead Code

These files/entries are confirmed dead or inconsistent — do not spend a discovery pass re-investigating them, and do not edit them expecting them to be live:

- `apps/backend/src/auth/guards/jwt-auth.guard.ts` — dead stub file (contains a "// Delete this entire file" style marker). The real, active guard is `apps/backend/src/auth/jwt-auth.guard.ts`.
- `apps/backend/src/auth/jwt.strategy.ts` — dead duplicate. The real, active strategy is `apps/backend/src/auth/strategies/jwt.strategy.ts`.
- `apps/backend/src/login/entities/login.entity.ts` — empty stub, not a real `@Entity`.
- `apps/backend/src/data-source.ts` (root) and `apps/backend/src/config/database.config.ts` — unused DataSource/config duplicates. The canonical DataSource is `apps/backend/src/config/data-source.ts`.
- A duplicate migration file, `AddActivationColumnsToUsers`, exists twice in `apps/backend/src/migrations/`.
- `@CacheTTL()` decorator on `sync.controller.ts` routes is a no-op — never actually read by the cache interceptor.
