# Database Contracts

Purpose:

Map important database models, ownership, and invariants.

This file is map only.

It is not proof of behavior.

Verify all DB contracts against schema, migrations, services, jobs, and tests.

If this map conflicts with source code, source code wins.

Mark stale or conflicting entries as `CONTRACT DRIFT`.

Mark missing contracts as `UNMAPPED CONTRACT`.

## Rules

- Use this map before schema, billing, payment, SMS credit, automation, job, webhook, or transaction planning.
- Verify all DB contracts against schema, migrations, services, jobs, and tests.
- If mutation path bypasses required invariant, mark `CONTRACT MISMATCH`.
- If map conflicts with source code, mark `CONTRACT DRIFT`.
- If contract is missing from map, mark `UNMAPPED CONTRACT`.
- Do not invent invariants.
- Unknown fields must be marked `TODO: Fill after repository analysis. Do not treat as verified.`

## Contract Index

| Domain | Model / Table | Owner Module | Important Fields | Invariants | Mutation Paths | Transaction / Idempotency Rules | Related APIs / Jobs | Risk | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Admin Accounts | `admin` (`src/admin/entities/admin.entity.ts`) | `src/admin/` | id, username (unique), email (unique), password, role, admin_id, first_name, last_name, is_active, created_at, date_activated, date_deactivated | username/email uniqueness | `AdminController` PATCH `/admin/:id`, PATCH `/admin/username/:username` (no role guard — see api-contracts.md gaps) | TODO: Fill after repository analysis. Do not treat as verified. | `/admin/*` routes | Deep | Passwords assumed hashed — verify hashing mechanism before relying on it. |
| Super Admin Accounts | `super-admin` (`src/super-admin/entities/super-admin.entity.ts`) | `src/super-admin/` | id, super_admin_id (unique), username (unique), email (unique), password, first_name, last_name, role, created_at, updated_at, is_active, date_activated, date_deactivated | username/email uniqueness | `SuperAdminController` POST `/super-admin/register` (no role check), POST `/super-admin/create-admin`, PATCH `/super-admin/:id` | TODO: Fill after repository analysis. Do not treat as verified. | `/super-admin/*` routes | Deep | Privilege-escalation surface — any authenticated user can insert a row here via `/super-admin/register`. |
| Employee Accounts | `employee` (`src/employee/entities/employee.entity.ts`) | `src/employee/` | id (uuid), username (unique), password, employee_id, first_name, last_name, is_active, date_created, date_activated, date_deactivated (nullable), device_id (json array), email (unique) | username/email uniqueness | `EmployeeController` POST `/employee`, PATCH `/employee/:employee_id` (both `@Roles(ADMIN, SUPER_ADMIN)`) | TODO: Fill after repository analysis. Do not treat as verified. | `/employee/*`, `/sync/employees` (password excluded on read) | Standard | `device_id` json array links an employee to one or more physical gate devices. |
| Students Roster | `students` (`src/students/entities/student.entity.ts`) | `src/students/`, mutated by `src/database-sync/` | id, ID_Number, Name, Lived_Name, Remarks, Photo, Campus_Entry, Unique_ID (bigint), isArchived (bool), group (nullable: EMPLOYEE/STUDENT/AGENCY), createdAt, updatedAt | Mirrors an external SQL Server source table; `isArchived` used instead of hard delete | Written by `src/database-sync/database-sync.service.ts` (external SQL Server pull + BioStar push), read by `src/students/students.controller.ts` and `src/sync/sync.controller.ts` (non-archived only) | **Concurrency invariant**: all mutations must go through the global async `studentMutationLock` mutex in the Database Sync module to serialize sync operations against this table | `/students/*`, `/sync/students`, `/database-sync/*` | Deep | Highest-risk table — bulk PII + photo data mirrored from an external system and pushed to physical access-control hardware. |
| Reports (Gate Events) | `reports` (`src/reports/entities/report.entity.ts`) | `src/reports/` | id (uuid), datetime, type ('1'=entry, '2'=exit), user_id, name, remarks (nullable), status (e.g. `GREEN;allowed` / `RED;...` / `YELLOW;pending`), device (nullable), gate (nullable, added by migration `AddGateColumnToReports`), created_at | Authoritative gate access-decision log — treat as append-mostly / audit trail | `ReportsController` POST `/reports` (single or bulk array insert) | TODO: Fill after repository analysis. Do not treat as verified. | `/reports/*`, `ReportsGateway` (`stats-update` websocket event, unauthenticated), `store/gateStats.ts` (FE aggregation) | Deep | `status` field is a compound string (`COLOR;reason`) — parsing logic must be verified against `lib/access-status.ts` campus-aware forking (DASMA 3-tier vs MTL binary) before changing shape. |
| Auth / Sessions | `token_blacklist` (`src/auth/entities/token-blacklist.entity.ts`) | `src/auth/` | id, token, blacklistedAt | Redis-backed with in-memory Map fallback if Redis is down; used to enforce single-active-token-per-(userId, role) | `token-blacklist.service.ts`, invoked on `/auth/logout` and new-login-supersedes-old-session flow | TODO: Fill after repository analysis. Do not treat as verified. | `/auth/login`, `/auth/logout`, global `JwtAuthGuard` | Deep | If Redis is down, session state falls back to an in-memory Map — not shared across multiple backend instances (scale-out risk). |
| Database Sync | `sync_schedule` (`src/database-sync/entities/sync-schedule.entity.ts`) | `src/database-sync/` | scheduleNumber, time, cronExpression, lastSyncTime | TODO: Fill after repository analysis. Do not treat as verified. | `database-sync.controller.ts` POST `/database-sync/schedule`, POST `/database-sync/biostar/schedule` | Scheduled via `cron` package + Nest `SchedulerRegistry`, timezone hardcoded `Asia/Manila` | `/database-sync/schedule*` | Deep | Default schedules 09:00/21:00. |
| Database Sync | `sync_queue` (`src/database-sync/entities/sync-queue.entity.ts`) | `src/database-sync/` | id (uuid), status (pending/processing/completed/failed), timestamps | Queue-item status must progress monotonically | `DatabaseSyncQueueService` (manual-sync queue) | Serialized by global `studentMutationLock` | `/database-sync/sync`, `/database-sync/running-syncs` | Deep | TODO: Fill after repository analysis. Do not treat as verified. |
| Database Sync | `biostar_sync_state` (`src/database-sync/entities/biostar-sync-state.entity.ts`) | `src/database-sync/` | schemaKey, lastModifiedCursor, lastProcessedOffset, lastProcessedUserId, lastRunAt, lastSuccessAt, lastError | Cursor-based incremental sync state — corrupting this can cause re-processing or skipped records | `services/shared/biostar-api.service.ts` and `database-sync.service.ts` | Serialized by global `studentMutationLock` | `/database-sync/biostar/sync` | Deep | Two source-schema strategies keyed by env var `SOURCE_DB_SCHEMA_ENV` (`main` vs `dasma`) — verify which schema a given deployment uses before editing sync logic. |
| Login (dead) | `login.entity.ts` (`src/login/entities/login.entity.ts`) | `src/login/` | N/A | N/A | N/A | N/A | N/A | N/A | **Dead code** — empty stub, not a real `@Entity`. Do not treat as a live table; do not add fields to it expecting persistence. |
