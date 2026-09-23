# Repository Map

Purpose:

Locate key files and directories quickly.

This file is map only.

It is not proof of behavior.

Use this to find likely files before detailed inspection.

Verify all conclusions against real source code.

If this map is stale, mark `CONTEXT DRIFT`.

This index follows the `symbol/area → path — one-line purpose` style. It covers significant/exported items surfaced by prior discovery passes — it is not exhaustive down to every private helper. Verify any path before relying on it for implementation.

## Root-Level Configuration

| Symbol / Area | Path | Purpose |
| --- | --- | --- |
| Workspace root | `package.json` | Bun + Turborepo root scripts: `build`, `dev`, `dev:backend`, `dev:web`, `build:backend`, `build:web`, `lint`, `format`, `check-types`, `verify:env:backend`, `verify:env:web`. |
| Turborepo config | `turbo.json` | Task pipeline definitions for the monorepo. |
| Shared packages | `packages/eslint-config`, `packages/typescript-config`, `packages/ui` | Shared workspace packages consumed by both apps. |

## Backend (`apps/backend`)

| Symbol / Area | Path | Purpose |
| --- | --- | --- |
| Entry point | `apps/backend/src/main.ts` | Boots `AppDataSource`, runs migrations on every boot, registers global `JwtAuthGuard`, wide-open CORS, Swagger at `/api/docs`, no global `ValidationPipe`, static `persistent_uploads/`. |
| Root module | `apps/backend/src/app.module.ts` | Registers all feature modules + global `HttpCacheInterceptor` (Redis-backed). |
| Canonical DataSource | `apps/backend/src/config/data-source.ts` | Used by `migration:*` npm scripts and `main.ts` boot. The one to trust. |
| Dead DataSource | `apps/backend/src/data-source.ts` | Unused duplicate — do not edit expecting effect. |
| Alt DataSource | `apps/backend/src/config/typeorm.config.ts` | Used by `typeorm:*` scripts (separate from `migration:*`). |
| Dead config | `apps/backend/src/config/database.config.ts` | Dead/unused. |
| Migrations | `apps/backend/src/migrations/` | 20 files; note a duplicate `AddActivationColumnsToUsers` migration exists twice. |
| Login controller | `apps/backend/src/login/login.controller.ts` | `POST /auth/login` (`@Public`), `POST /auth/logout`, `POST /auth/employee` (`@Public`), `GET /auth/validate`. |
| Login service | `apps/backend/src/login/login.service.ts` | Issues JWTs. Line 108: known `role:'ADMIN'` uppercase-casing bug. |
| Login dead entity | `apps/backend/src/login/entities/login.entity.ts` | Empty stub, not a real `@Entity`. |
| Admin controller | `apps/backend/src/admin/admin.controller.ts` | `/admin` routes — global JWT only, NO role guard. |
| Admin entity | `apps/backend/src/admin/entities/admin.entity.ts` | `admin` table. |
| Super admin controller | `apps/backend/src/super-admin/super-admin.controller.ts` | `/super-admin` routes — `/register` has no role check. |
| Super admin entity | `apps/backend/src/super-admin/entities/super-admin.entity.ts` | `super-admin` table. |
| Users controller | `apps/backend/src/users/users.controller.ts` | `/users` — list, generate-csv, bulk-deactivate, bulk-reactivate (`@Roles(SUPER_ADMIN, ADMIN)`). |
| Employee controller | `apps/backend/src/employee/employee.controller.ts` | `/employee` CRUD-ish routes, `RolesGuard` on create/update. |
| Employee entity | `apps/backend/src/employee/entities/employee.entity.ts` | `employee` table, `device_id` json array. |
| Students controller | `apps/backend/src/students/students.controller.ts` | `/students`, `/students/generate-csv` — JWT only, no role guard. |
| Student entity | `apps/backend/src/students/entities/student.entity.ts` | `students` table, mirrors external SQL Server source. |
| Reports controller | `apps/backend/src/reports/reports.controller.ts` | `/reports` CRUD + `/reports/analytics/gates`, `/reports/generate-csv`. |
| Reports gateway | `apps/backend/src/reports/reports.gateway.ts` | Socket.IO `/socket.io/`, event `stats-update`, NO auth guard, polls via `@Interval` every 1s. |
| Report entity | `apps/backend/src/reports/entities/report.entity.ts` | `reports` table — authoritative gate access-decision log. |
| Sync controller | `apps/backend/src/sync/sync.controller.ts` | `/sync/students`, `/sync/employees` — read-only pull endpoints. |
| Database sync controller | `apps/backend/src/database-sync/database-sync.controller.ts` | `/database-sync/*` — schedule, sync, biostar sync, test-connection, delete-users. |
| Database sync service | `apps/backend/src/database-sync/database-sync.service.ts` | Core sync orchestration logic. |
| Database sync queue service | `apps/backend/src/database-sync/database-sync-queue.service.ts` | Manual-sync queue backed by `sync_queue` table. |
| BioStar API service | `apps/backend/src/database-sync/services/shared/biostar-api.service.ts` | Talks to Suprema BioStar 2 hardware API. |
| Sync entities | `apps/backend/src/database-sync/entities/sync-schedule.entity.ts`, `sync-queue.entity.ts`, `biostar-sync-state.entity.ts` | Schedule config, queue state, and BioStar cursor state tables. |
| Screensaver controller | `apps/backend/src/screensaver/screensaver.controller.ts` | `POST /screensaver/upload` (10MB, manual super-admin check), `GET /screensaver`. |
| Health controller | `apps/backend/src/health/health.controller.ts` | `GET /health` — inherits global JWT guard, not `@Public()`. |
| Auth guard (real) | `apps/backend/src/auth/jwt-auth.guard.ts` | Global JWT guard; has dev-mode SUPER_ADMIN bypass when `NODE_ENV=development` and no token. |
| Auth guard (dead) | `apps/backend/src/auth/guards/jwt-auth.guard.ts` | Dead stub — do not use. |
| JWT strategy (real) | `apps/backend/src/auth/strategies/jwt.strategy.ts` | Active Passport JWT strategy. |
| JWT strategy (dead) | `apps/backend/src/auth/jwt.strategy.ts` | Dead duplicate — do not use. |
| Roles guard | `apps/backend/src/auth/guards/roles.guard.ts` | Real, used — paired with `@Roles()` decorator. |
| Roles decorator | `apps/backend/src/auth/decorators/roles.decorator.ts` | `@Roles(...)` metadata decorator. |
| Role enum | `apps/backend/src/auth/enums/role.enum.ts` | `USER='user'`, `ADMIN='admin'`, `SUPER_ADMIN='super-admin'`, `EMPLOYEE='employee'`. |
| Token blacklist service | `apps/backend/src/auth/token-blacklist.service.ts` | Enforces single active token per (userId, role); Redis-backed, in-memory Map fallback. |
| Token blacklist entity | `apps/backend/src/auth/entities/token-blacklist.entity.ts` | `token_blacklist` table. |
| App controller | `apps/backend/src/app.controller.ts` | Dead — no routes. `test/app.e2e-spec.ts` expects `GET /` and is likely stale/failing. |
| Backend unit tests | `apps/backend/src/**/*.spec.ts` | 11 spec files; only `admin`, `app`, `employee`, `login`, `reports` covered. |
| Backend e2e test | `apps/backend/test/app.e2e-spec.ts` | Only e2e spec; likely stale. |

## Frontend (`apps/portal-web`)

| Symbol / Area | Path | Purpose |
| --- | --- | --- |
| Root layout | `apps/portal-web/src/app/layout.tsx` | Mounts `MockModeProvider` at top of tree. |
| Dashboard route | `apps/portal-web/src/app/dashboard/` | Server component, redirects to `/login` without `user` cookie; admin dashboard with live BioStar WS feed or mock data. |
| Auth server action | `apps/portal-web/src/app/actions/auth.ts` | `getUser()` — reads `user` cookie server-side. |
| Employee dashboard | `apps/portal-web/src/app/employee-dashboard/` | `TurnstileDashboard`, employee-facing live turnstile view. |
| Login routes | `apps/portal-web/src/app/login/`, `login/admin/`, `login/employee/` | All render shared `LoginForm`. |
| Reports route | `apps/portal-web/src/app/reports/` | `ReportsPageContainer` — table, filters, gate-usage chart, export. |
| Settings routes | `apps/portal-web/src/app/settings/`, `settings/operation/` | `AccountForm`; screensaver upload + idle interval. |
| User management route | `apps/portal-web/src/app/user-management/` | Client-only, dynamic import `ssr:false`. |
| Dev test route | `apps/portal-web/src/app/wstest/` | Dev-only BioStar WS test harness, not a product route. |
| BioStar proxy routes | `apps/portal-web/src/app/api/login/`, `api/devices/`, `api/events/`, `api/users/` | Same-origin HTTPS proxies to on-prem BioStar 2 device server; bypass TLS verification, forward `bs-session-id` header. |
| Zustand store | `apps/portal-web/src/store/gateStats.ts` | `useGateStatsStore` — `{allowed, allowedWithRemarks, notAllowed}`, persisted to localStorage `gate-stats`. |
| Auth context | `apps/portal-web/src/lib/auth-context.tsx` | `useAuth().login()`/session state; stores token in cookie via `js-cookie`, not localStorage. |
| Axios interceptor | `apps/portal-web/src/lib/axios-interceptor.ts` | Response-only interceptor: 401 → clear cookies + redirect `/login`. No request interceptor / no centralized baseURL+auth-header instance. |
| Mock mode | `apps/portal-web/src/lib/mock-mode.ts` | `isMockMode()` reads `NEXT_PUBLIC_MOCK_MODE`. |
| Campus mode | `apps/portal-web/src/lib/campus-mode.ts` | `getCampusMode()` reads `NEXT_PUBLIC_CAMPUS` → `"MTL"` or `"DASMA"`. |
| Access status | `apps/portal-web/src/lib/access-status.ts` | `getAccessStatus()` — DASMA 3-tier vs MTL binary status/remarks forking. |
| Report mapper | `apps/portal-web/src/lib/report-mapper.ts` | `mapScanToReportData()` — maps BioStar scan events to report POST payloads. |
| Middleware | `apps/portal-web/src/middleware.ts` | Route protection via `user` cookie JWT decode. KNOWN BUG: matcher list includes literal `"dashboard"` (missing leading slash), never matches; role-based redirect logic exists but is commented out. |
| Report socket hook | `apps/portal-web/src/hooks/useReportSocket.tsx` | socket.io-client to backend `NEXT_PUBLIC_API_URL`, path `/socket.io/`, listens for `stats-update`. Branches to fake data in mock mode. |
| Mock mode provider | `apps/portal-web/src/components/providers/mock-mode-provider.tsx` | Dynamically starts MSW `setupWorker` when mock mode is active. |
| MSW setup | `apps/portal-web/src/mocks/browser.ts`, `mocks/handlers/*`, `mocks/data/*` | Mock Service Worker handlers/fixtures. |
| Custom components | `apps/portal-web/src/components/custom/` | `CustomTable`, `CustomDropdown`, `CustomExport`, `CustomFilter`, `CustomMultiSelect`, `LoginForm`. |
| Dashboard components | `apps/portal-web/src/components/dashboard/` | `gate-access-stats`, `live-data-table`, `statistics-card`. |
| Employee dashboard components | `apps/portal-web/src/components/employee-dashboard/` | `TurnstileDashboard`, `TurnstileGrid`, `EntriesLog`, `RecentEntriesTable`. |
| Reports components | `apps/portal-web/src/components/reports/` | `ReportsPageContainer`, `ReportsTable`, `GateUsageChart`. |
| Settings components | `apps/portal-web/src/components/settings/` | `account-form`, `operation-settings`, `screen-saver-upload`, `settings-nav`, `time-picker`. |
| Users components | `apps/portal-web/src/components/users/` | `UserManagementPageContainer`, `AdminForm`, `EmployeeForm`, `SuperAdminForm`, `EditDetailsDialog`, `ViewProfileDialog` — has its own duplicated `CustomDropdown`/`CustomTable`, not shared with `components/custom/`. |
| UI primitives | `apps/portal-web/src/components/ui/` | shadcn/Radix primitives. |
| Frontend test config | `apps/portal-web/vitest.config.ts` | jsdom, setupFiles `src/test/setup.ts`. |
| Frontend tests | `apps/portal-web/src/**/*.test.{ts,tsx}` | 9 files, all campus-mode/access-status feature area — see `testing-strategy.md` for gaps. |

## Documentation

| Directory | Purpose |
| --- | --- |
| `.ai-engineering/` | AI operating layer (rules, workflows, and this knowledge base) — maps only, not proof. |

## Update Status

Last refreshed: 2026-08-08 (migration from `docs/ai/` to `.ai-engineering/knowledge/`).

Stale entries: none known at time of writing — verify against source before relying on this map for a Deep task.

Missing entries: deployment target docs beyond `deployment_docs_ws2022_prod/README.md`; CI workflow files unconfirmed (no `.github/workflows/` detected).
