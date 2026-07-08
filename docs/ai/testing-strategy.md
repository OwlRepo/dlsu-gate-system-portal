# Testing Strategy

Purpose:

Map task size and risk to expected verification.

This file is map only.

Commands must be verified from package scripts or repo docs before being listed as valid.

## Verification by Task Size

| Task Size | Minimum Verification | Extra Verification | Manual QA | Notes |
| --- | --- | --- | --- | --- |
| Tiny | targeted read-through or formatting check | none | visual/read-through | no behavior change |
| Express | targeted type/lint/test if available | related test if available | focused flow | single-layer change |
| Standard | verified type/lint/test/build commands if available + related tests | regression test when relevant | affected workflow | FE-BE or multi-file changes |
| Deep | verified type/lint/test/build commands if available + regression tests | migration/payment/job/webhook/permission checks when relevant | full critical flow | billing/payments/auth/jobs/schema/transactions |

## Verification Command Discovery Rule

- Claude must discover commands from package scripts or repo docs
- Do not claim commands as valid unless verified from:
  - `package.json` scripts
  - `Makefile` targets
  - `.github/workflows/` CI definitions
  - `docs/` deployment/verification guides
  - Project README
- Commands below are verified from `apps/backend/package.json`, `apps/portal-web/package.json`, and root `package.json`. Do not re-derive generic candidates for this repo — use these directly.
- If verification command cannot run due to environment/config → mark blocker

## Verified Commands — Backend (`apps/backend`, Bun + NestJS)

| Category | Command | Notes |
| --- | --- | --- |
| Build | `bun run build` / `npm run build` | Turbo-orchestrated from root, or run inside `apps/backend`. |
| Dev server | `bun run dev` / `npm run dev` | Runs migrations automatically on boot (`main.ts` → `AppDataSource`). |
| Type checking | `bun run check-types` | `tsc --noEmit`. |
| Linting | `bun run lint` | `eslint --fix`. |
| Unit tests | `bun run test` / `npm test` | Jest, co-located `*.spec.ts` files under `apps/backend/src`. Only 11 spec files exist, covering `admin`, `app`, `employee`, `login`, `reports`. |
| Coverage | `bun run test:cov` | Jest coverage report. |
| E2E tests | `bun run test:e2e` | `jest --config test/jest-e2e.json`. Only one spec (`test/app.e2e-spec.ts`) exists and it expects `GET /` → `"Hello World!"`, but `AppController` has no routes — **this test is likely stale/failing; verify before relying on it as a regression gate.** |
| Migrations | `bun run migration:generate` / `migration:run` / `migration:revert` | Uses `src/config/data-source.ts` (the canonical DataSource — see architecture-manifest.md for the 3 inconsistent DataSource configs). |

## Verified Commands — Frontend (`apps/portal-web`, Next.js 15 + Vitest)

| Category | Command | Notes |
| --- | --- | --- |
| Build | `bun run build` / `npm run build` | Next.js production build. |
| Dev server | `bun run dev` | Next.js dev server. |
| Type checking | `bun run check-types` | TODO: Fill after repository analysis. Do not treat as verified. (confirm exact script — `tsc --noEmit` assumed consistent with backend convention) |
| Linting | `bun run lint` | ESLint. |
| Unit/component tests | `bun run test` | `vitest run`, targets `apps/portal-web/src/**/*.test.{ts,tsx}`. Only 9 test files exist, ALL added in one commit, ALL scoped to the campus-mode/access-status feature area (see Known Test Coverage Gaps below). |
| Watch mode | `bun run test:watch` | Vitest watch mode. |
| Coverage | `bun run test:coverage` | Vitest coverage report. |

## Verified Commands — Root (Turborepo-orchestrated)

| Category | Command | Notes |
| --- | --- | --- |
| Build (all) | `bun run build` | Turbo fan-out to backend + web. |
| Build backend only | `bun run build:backend` | TODO: Fill after repository analysis. Do not treat as verified. (confirm exact turbo filter) |
| Build web only | `bun run build:web` | TODO: Fill after repository analysis. Do not treat as verified. |
| Dev (all) | `bun run dev` | Turbo fan-out. |
| Dev backend only | `bun run dev:backend` | TODO: Fill after repository analysis. Do not treat as verified. |
| Dev web only | `bun run dev:web` | TODO: Fill after repository analysis. Do not treat as verified. |
| Lint (all) | `bun run lint` | Turbo fan-out to both apps. |
| Format | `bun run format` | TODO: Fill after repository analysis. Do not treat as verified. (confirm formatter — prettier assumed) |
| Type check (all) | `bun run check-types` | Turbo fan-out to both apps. |
| Env verification (backend) | `bun run verify:env:backend` | TODO: Fill after repository analysis. Do not treat as verified. (confirm what this checks) |
| Env verification (web) | `bun run verify:env:web` | TODO: Fill after repository analysis. Do not treat as verified. |

## Known Test Coverage Gaps

**Backend — zero unit tests exist for these modules** (verified: only `admin`, `app`, `employee`, `login`, `reports` have `*.spec.ts` files under `apps/backend/src`):

- `src/students/` (Students Roster)
- `src/users/` (User Directory / bulk deactivate-reactivate)
- `src/super-admin/` (Super Admin Accounts — includes the no-role-check `/register` endpoint)
- `src/sync/` (mobile/offline pull)
- `src/database-sync/` (external SQL Server + BioStar integration — highest-risk module in the repo)
- `src/auth/` (JWT strategy, guards, token blacklist — includes the dev-mode super-admin bypass)
- `src/health/`
- `src/screensaver/`

Additionally, `test/app.e2e-spec.ts` is the only e2e spec and is likely stale (expects a `GET /` route that no longer exists).

**Frontend — only the campus-mode/access-status feature area is covered.** The 9 existing Vitest files (`lib/access-status.test.ts`, `lib/campus-mode.test.ts`, `components/custom/CustomTable.test.tsx`, `components/dashboard/gate-access-stats.test.tsx`, `components/dashboard/live-data-table.test.tsx`, `components/employee-dashboard/EntriesLog.test.tsx`, `components/employee-dashboard/TurnstileGrid.test.tsx`, `components/reports/ReportsPageContainer.test.tsx`, `components/reports/ReportsTable.test.tsx`) were all added in a single commit. There are **no tests** for:

- Hooks (`src/hooks/useReportSocket.tsx`, etc.)
- `src/middleware.ts` (route protection — including the known dead `"dashboard"` matcher-string bug)
- `lib/auth-context.tsx`
- MSW mock handlers (`src/mocks/handlers/*`)

## Deep Task Verification

Deep tasks require:

1. All discovered type/lint/test/build commands for the affected app(s) (backend and/or frontend)
2. Regression test suite run
3. **If the task touches a module listed under Known Test Coverage Gaps above, write new tests as part of the task — do not rely solely on running the (nonexistent) existing suite.** This applies especially to `database-sync`, `auth`, `super-admin`, and `users`, given their risk level in risk-register.md.
4. Specific checks for task domain:
   - **Auth/Sessions**: Auth flow tests, permission boundary tests, explicit test of the dev-mode bypass behavior and the login.service.ts:108 role-casing bug if touched
   - **Database Sync/BioStar**: Sync idempotency tests, `studentMutationLock` concurrency tests, external-service failure/rollback tests
   - **Reports/Gate Events**: Websocket broadcast tests, access-status mapping tests (DASMA vs MTL) if `lib/access-status.ts` is touched
   - **Schema/Migrations**: Migration up/down tests, verify against the canonical `src/config/data-source.ts` (not the dead duplicate configs)
5. Manual QA of full critical flow
6. Rollback procedure documented and tested
