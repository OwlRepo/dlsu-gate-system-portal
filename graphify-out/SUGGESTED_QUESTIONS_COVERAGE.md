# Suggested Questions — 100% Coverage

Coverage: **7/7 Graphify-suggested questions answered (100%)**.

This complements the structural coverage audit: **413/413 supported repository files** and **4,956/4,956 extracted evidence records** are represented. “100%” here means all generated questions and all measurable supported-file/evidence checks are covered; it does not claim proof of every possible runtime behavior.

## Decision Summary

| # | Question | Verdict | Priority |
|---|---|---|---|
| 1 | What connects `$schema`, `collection`, and `sourceRoot`? | Nest CLI build metadata; document the semantic link, no runtime refactor | Low |
| 2 | Split Sidebar Navigation UI? | Yes—separate context/shell/menu responsibilities while preserving exports | Medium |
| 3 | Split Database Sync Orchestration? | Yes—phased extraction around scheduler, execution, and mutation safety | Critical |
| 4 | Split Turnstile Dashboard UI? | Yes—deduplicate socket, event, report, and data-fetching state | High |
| 5 | Split Root Tooling Scripts? | No architectural split; namespace commands and extract complex shell chains | Medium |
| 6 | Split Super Admin Controller? | Split the service responsibilities; keep the cohesive controller for now | High |
| 7 | Split Employee Management Backend? | Split bootstrap, query, mutation, and ID concerns; controller may remain | High |

## 1. `$schema`, `collection`, and `sourceRoot`

**Answer:** They connect through Nest CLI configuration, not application imports.

- `apps/backend/nest-cli.json:2` points `$schema` at the Nest CLI JSON schema.
- `apps/backend/nest-cli.json:3` selects `@nestjs/schematics` as the code-generation collection.
- `apps/backend/nest-cli.json:4` defines `src` as the backend source root.
- `apps/backend/nest-cli.json:5-7` configures compiler cleanup with `deleteOutDir`.
- The semantic consumers are the backend `build`, `start`, and `dev` commands in `apps/backend/package.json`; JSON configuration keys do not create import edges, so Graphify correctly exposes them as weakly connected.

**Action:** Keep the configuration intact. Add/retain a documentation edge from Nest CLI configuration to the backend build pipeline when interpreting the graph. Do not invent runtime dependencies merely to eliminate isolated nodes.

## 2. Sidebar Navigation UI

**Answer:** Yes, split by stable responsibility, but preserve the current public component API.

Graph evidence: **81 nodes, 14 files, 116 internal edges, 75 boundary edges**. The principal file, `apps/portal-web/src/components/ui/sidebar.tsx`, is **763 lines** and contains:

- context, provider, and `useSidebar` (`:29-158`),
- shell/layout primitives (`Sidebar`, trigger, rail, inset, header, footer, content; `:159-415`),
- group primitives (`:416-487`),
- menu variants and primitives (`:488-737`).

`apps/portal-web/src/components/app-sidebar.tsx` remains a separate product-level adapter for route, authentication, cookie, loading, and role-filtering behavior.

**Action:** Extract `sidebar-context`, `sidebar-shell`, and `sidebar-menu`, then re-export them from the existing module. Avoid one-file-per-trivial-component fragmentation. Add provider behavior, keyboard shortcut, mobile sheet, active-route, and role-visibility tests before moving code.

## 3. Database Sync Orchestration

**Answer:** Yes. This is the highest-priority split.

Graph evidence: **76 nodes, 8 files, 169 internal edges, 43 boundary edges**. The core implementation spans **4,296 lines**:

- `database-sync.service.ts`: 983 lines,
- `database-sync.controller.ts`: 441 lines,
- `database-sync-queue.service.ts`: 151 lines,
- `main-path-sync.service.ts`: 868 lines,
- `dasmariñas-path-sync.service.ts`: 1,296 lines,
- `database-sync-common.service.ts`: 557 lines.

`DatabaseSyncService` combines scheduling, cron registration, job tracking, path selection, locking, manual and queued execution, schedule persistence, BioStar synchronization, connection testing, status reporting, and destructive user deletion. The existing `studentMutationLock` and active-job state are correctness boundaries.

**Action, phased:**

1. Characterize lock, rollback, schedule, queue-order, and partial-failure behavior with tests.
2. Extract `SyncScheduleService` and scheduler registration.
3. Extract `SyncExecutionCoordinator`, retaining the single mutation lock and active-job ownership.
4. Isolate user deletion/import commands behind an explicit privileged service.
5. Keep main/Dasmariñas strategies, then separately extract shared BioStar mapping, CSV parsing, and batch persistence from those large services.

Do not distribute lock ownership across services; one coordinator must retain the synchronization invariant.

## 4. Turnstile Dashboard UI

**Answer:** Yes. Two large dashboards repeat the same operational concerns.

Graph evidence: **68 nodes, 19 files, 124 internal edges, 106 boundary edges**. Relevant code totals **2,372 lines**, including:

- `apps/portal-web/src/app/dashboard/dashboard.tsx`: 701 lines,
- `apps/portal-web/src/components/employee-dashboard/TurnstileDashboard.tsx`: 767 lines,
- `EntriesLog.tsx`: 241 lines,
- `TurnstileGrid.tsx`: 231 lines,
- `live-data-table.tsx`: 190 lines.

Both dashboard roots manage WebSocket lifecycle/reconnection, queued events, user/event fetching, report delivery, clearing/reset behavior, and presentation. Shared helpers already exist in `src/lib/biostar-event.ts`, `ws-reconnect.ts`, and `access-status.ts`, but orchestration remains duplicated.

**Action:** Extract a shared `useBiostarSocket`, event-state reducer, API adapter, and report-delivery/retry queue. Keep `Dashboard`, `TurnstileDashboard`, `EntriesLog`, `TurnstileGrid`, and `LiveDataTable` as presentation/composition layers. Verify reconnect, duplicate-event suppression, retry ordering, daily reset, and access-status mapping with fake timers and mocked sockets.

## 5. Root Tooling Scripts

**Answer:** Do not split this as an application module. Reorganize command ergonomics and extract only complex command bodies.

Graph evidence: **56 nodes, one file, 55 internal edges, one boundary edge**. The community is actually the script map in `apps/backend/package.json`, not repository-root runtime code. Its star topology is normal for a package manifest.

The scripts span build/start/dev, lint/typecheck, Jest, TypeORM migrations/schema, Docker, PM2, maintenance/security, Codex setup/update, cleanup, and Windows deployment/service commands.

**Action:**

- retain discoverable aliases in `package.json`,
- normalize namespaces such as `db:*`, `check:*`, `pm2:*`, and `windows:*`,
- move multi-command or platform-specific logic into versioned `scripts/*.mjs` or existing deployment scripts,
- standardize intentional `bun` versus `npm` usage,
- guard and document cleanup, schema, migration, and audit-fix commands.

This lowers maintenance risk without fabricating architectural modules around a manifest.

## 6. Super Admin Controller

**Answer:** Split the service, not necessarily the controller.

Graph evidence: **54 nodes, 6 files, 82 internal edges, 23 boundary edges**. The area contains **663 lines**: controller 194, service 363, and DTOs 106. The controller has four cohesive endpoint groups; its apparent size is partly Swagger and authorization decoration.

`SuperAdminService` mixes runtime schema creation, default-user seeding, ID generation, lookup, admin provisioning, super-admin creation, and update behavior.

**Action:**

- replace `ensureTablesExist` runtime DDL with migrations,
- move default-account setup into an idempotent seeder/bootstrap task,
- isolate identity generation,
- separate admin provisioning from super-admin query/mutation operations,
- keep the controller intact until endpoint ownership or authorization policies genuinely diverge.

Protect uniqueness, password hashing, role assignment, and bootstrap idempotency with integration tests.

## 7. Employee Management Backend

**Answer:** Yes, split service responsibilities moderately; keep the HTTP surface cohesive unless adopting command/query separation consistently.

Graph evidence: **50 nodes, 5 files, 77 internal edges, 18 boundary edges**. The area contains **745 lines**: controller 241, service 389, and DTOs 115.

`EmployeeManagementService` combines runtime table creation, employee-ID generation, create/update/disable commands, general lookup, device lookup, and date-range queries. The controller's six endpoint groups remain one recognizable employee-management resource.

**Action:**

- migrate runtime schema creation to database migrations,
- extract an employee-ID generator,
- separate query/repository operations from mutation commands,
- keep controller routes stable; split query/command controllers only if the project adopts that boundary elsewhere.

Test ID uniqueness, duplicate/device constraints, date boundaries and timezone behavior, disable semantics, and update authorization.

## Execution Order

1. Database Sync Orchestration—largest correctness and operational risk.
2. Turnstile Dashboard UI—largest duplication and client-state risk.
3. Super Admin and Employee services—remove runtime DDL first.
4. Sidebar primitives—API-preserving maintainability refactor.
5. Tooling scripts—namespace and extract complex command bodies.
6. Preserve the Nest CLI keys; improve only their graph/documentation interpretation.

Every generated question now has a verdict, evidence, an explicit action, and a verification target.
