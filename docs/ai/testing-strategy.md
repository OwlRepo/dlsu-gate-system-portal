# Testing Strategy

> Load rule: read before writing tests or claiming a change is verified. The Strict TDD section is enforced by the Claude hook and `npm run tdd:gate`.
> Source of truth: this is a MAP, never proof. Real code, tests, types, migrations and `package.json` scripts win; a mismatch is `CONTEXT DRIFT` (`CONTRACT DRIFT` for the contracts, testing and risk docs) — see `docs/ai/context-refresh.md`.

Purpose:

Map task size and risk to expected verification, and record real verified commands.

This file is map only.

Commands must be verified from package scripts or repo docs before being listed as valid.

## Verification by Task Size

| Task Size | Minimum Verification | Extra Verification | Manual QA | Notes |
| --- | --- | --- | --- | --- |
| Tiny | targeted read-through or formatting check | none | visual/read-through | no behavior change |
| Express | targeted type/lint/test if available | related test if available | focused flow | single-layer change |
| Standard | verified type/lint/test/build commands if available + related tests | regression test when relevant | affected workflow | FE-BE or multi-file changes |
| Deep | verified type/lint/test/build commands if available + regression tests | migration/job/permission checks when relevant | full critical flow | auth/database-sync/reports/schema/account-management |

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

## Verified Commands — Root (Turborepo-orchestrated, Bun 1.2.22)

| Category | Command | Notes |
| --- | --- | --- |
| Install | `bun install` | |
| Build (all) | `bun run build` | Turbo fan-out to backend + web. |
| Build backend only | `bun run build:backend` | |
| Build web only | `bun run build:web` | |
| Dev (all) | `bun run dev` | Turbo fan-out. |
| Dev backend only | `bun run dev:backend` | |
| Dev web only | `bun run dev:web` | |
| Lint (all) | `bun run lint` | Turbo fan-out to both apps. |
| Format | `bun run format` | |
| Type check (all) | `bun run check-types` | Turbo fan-out to both apps. |
| Env verification (backend) | `bun run verify:env:backend` | |
| Env verification (web) | `bun run verify:env:web` | |
| DB migrate | `bun --cwd apps/backend run migration:run` | |
| DB generate | `bun --cwd apps/backend run migration:generate` | |

## Verified Commands — Backend (`apps/backend`, Bun + NestJS)

| Category | Command | Notes |
| --- | --- | --- |
| Build | `bun run build` / `npm run build` | Turbo-orchestrated from root, or run inside `apps/backend`. |
| Dev server | `bun run dev` / `npm run dev` | Runs migrations automatically on boot (`main.ts` → `AppDataSource`). |
| Type checking | `bun run check-types` | `tsc --noEmit`. |
| Linting | `bun run lint` | `eslint --fix`. |
| Unit tests | `bun run test` / `npm test` | Jest, co-located `*.spec.ts` files under `apps/backend/src`. 21 spec files, 286 tests (measured 2026-09-23). Run with `TZ=Asia/Manila` — the Dasma specs pin the clock and assert Manila-anchored datetimes. |
| Coverage | `bun run test:cov` | Jest coverage report. |
| E2E tests | `TZ=Asia/Manila bun run test:e2e` | `jest --config test/jest-e2e.json`. `test/dasma-sync-biostar.e2e-spec.ts` runs the Dasma sync against a real local PostgreSQL (`dlsu_gate_system_e2e`, schema built by the migrations) and a fake BioStar HTTP server (`test/fake-biostar-server.ts`) over real axios/multipart/fs — only the `mssql` driver is faked. Create the database once: `createdb -h localhost -p 5433 -U postgres dlsu_gate_system_e2e`. The stale Nest-scaffold `app.e2e-spec.ts` was removed: it asserted `GET /` → `"Hello World!"` on an `AppController` that has no routes, and could not even load. |
| Migrations | `bun run migration:generate` / `migration:run` / `migration:revert` | Uses `src/config/data-source.ts` (the canonical DataSource — see `docs/ai/architecture-manifest.md` for the 3 inconsistent DataSource configs). |

## Verified Commands — Frontend (`apps/portal-web`, Next.js 15 + Vitest)

| Category | Command | Notes |
| --- | --- | --- |
| Build | `bun run build` / `npm run build` | Next.js production build. |
| Dev server | `bun run dev` | Next.js dev server. |
| Type checking | `bun run check-types` | `node ../../scripts/run-with-root-env.mjs tsc --noEmit` (verified in `apps/portal-web/package.json`). |
| Linting | `bun run lint` | ESLint. |
| Unit/component tests | `bun run test` | `vitest run`, targets `apps/portal-web/src/**/*.test.{ts,tsx}`. 17 test files, 80 tests (measured 2026-09-23). |
| Watch mode | `bun run test:watch` | Vitest watch mode. |
| Coverage | `bun run test:coverage` | Vitest coverage report. |

## Strict TDD

Enforced, not advisory: the Claude edit guard blocks the agent, and `npm run tdd:gate` blocks the PR (run by hand before opening it — there is no CI; `docs/ai/handoff.md` "Completion Gate").

1. **RED before any implementation.** Write every test the plan's Test Matrix requires, run `npm run tdd:red`, and see it fail. Commit the tests on their own as `test(<scope>): ...` before any `apps/*/src` logic changes. `tdd:red` records the RED in `<git-dir>/tdd-red.json` (per worktree, never committed).
2. **Case order: `error:` > `edge:` > `regression:` > `happy:`.** Every new `it(`/`test(` title starts with one of those prefixes and is declared in that order. Jest and Vitest run cases in declaration order, so error and edge cases also run first. A valid RED has at least one `error:`, `edge:` or `regression:` case failing, or a test file that cannot load yet because its module does not exist. Only `happy:` failing is not a RED.
3. **Then implement until green.** Implementers may add tests. They never weaken or delete a RED test without saying why in the PR.

What counts as what (`scripts/ci/tdd-lib.mjs`):

| Path | Kind |
|---|---|
| `apps/backend/src/**/*.ts` except `*.spec.ts`, `*.d.ts`, `src/migrations/**` | guarded logic |
| `apps/portal-web/src/**/*.ts` except `*.test.ts`, `*.d.ts`, `src/test/**` (mocks included — mock mode runs them in the browser) | guarded logic |
| `apps/portal-web/src/**/*.tsx` except `*.test.tsx` | guarded UI |
| `apps/backend/src/**/*.spec.ts` | Jest — runnable for RED |
| `apps/portal-web/src/**/*.test.{ts,tsx}` | Vitest — runnable for RED (`.test.tsx` is the UI layer) |
| `scripts/**/*.test.mjs` | node:test — runnable for RED |
| `apps/backend/test/**/*.e2e-spec.ts` | backend e2e — presence only (needs PostgreSQL + fake BioStar) |
| `apps/backend/src/migrations/*.ts` | migration |
| `apps/backend/src/migrations/**/*.spec.ts`, `apps/backend/test/**/*migration*` | migration test |

Enforcement:

| Where | What | Bypass |
|---|---|---|
| Claude session | `.claude/settings.json` PreToolUse hook `scripts/hooks/tdd-red-guard.mjs` blocks Edit/Write (and Bash `sed -i`, `>`, `tee`, `cp`/`mv`) on guarded logic/UI until a valid RED marker exists for the current branch | `npm run tdd:red -- --waiver "<reason>"`, which then must appear in the PR as `TDD-Waiver:` |
| Before every PR | `npm run tdd:gate` (`scripts/ci/tdd-gate.mjs`, base `origin/main`): tests present for changed logic; a Vitest `*.test.tsx` for changed UI; a migration test for a changed migration; titles prefixed and ordered; **the branch's tests run against the merge-base code and must fail** (`TDD-Waiver: refactor ...` inverts this: they must pass there). Pass the PR body with `PR_BODY=...` or `--pr-body-file <path>` so waivers are read. | `TDD-Waiver:` / `UI-Test-Waiver:` / `Migration-Waiver:` lines in the PR body |

Known limits: the Bash guard is a heuristic; a human editing by hand bypasses the local guard; `it.each(...)(...)` titles are not parsed; backend e2e and migration tests need a database, so the gate only checks they exist and their red run goes in the PR body. Existing test files are grandfathered: only titles a diff adds are checked. With no CI, the gate is only as strong as the handoff rule that requires running it — every waiver and the gate output go in the PR body where review can challenge them.

## Mandatory Test Layers (every implementation plan)

| Diff touches | Required | Not required when |
|---|---|---|
| guarded logic (`apps/*/src/**/*.ts`) | Jest spec or Vitest test | never |
| guarded UI (`apps/portal-web/src/**/*.tsx`) | Vitest + Testing Library `*.test.tsx` | the diff is backend-only; or `UI-Test-Waiver:` with reason |
| `apps/backend/src/migrations/*.ts` | migration test | `Migration-Waiver:` naming the manual up/down verification |
| `database-sync` end-to-end behaviour | `apps/backend/test/*.e2e-spec.ts` against local PostgreSQL + fake BioStar | the change is confined to a unit covered by specs |
| any deployable change | smoke: app boots (`bun run dev:backend` / `bun run dev:web`) and the touched flow answers | docs-only diff |

A layer may be dropped only with an explicit waiver line in the plan naming the layer and the reason. A silently missing layer makes the plan invalid.

## Targeted runs (default) vs whole suite

Verify a change with the tests for the files you touched, then the whole suite before the PR:

- One backend spec: `cd apps/backend && npx jest src/<path>.spec.ts`
- One portal test: `cd apps/portal-web && npx vitest run src/<path>.test.tsx`
- Whole suites: `cd apps/backend && TZ=Asia/Manila npx jest`, `cd apps/portal-web && npx vitest run`, root `npm run test:scripts`.

## Known Test Coverage Gaps

**Backend — modules still without unit tests:**

- `src/users/` (User Directory / bulk deactivate-reactivate)
- `src/super-admin/` (Super Admin Accounts — includes the no-role-check `/register` endpoint)
- `src/sync/` (mobile/offline pull)
- `src/screensaver/`

No longer gaps: `src/database-sync/` now has four specs — the Dasma path, the shared common service, the BioStar API write path, and a CSV-bytes/volume spec that asserts the exported file byte-for-byte and pins how many overwrite imports a full roster costs. `src/students/`, `src/auth/` and `src/health/` are also covered.

E2E coverage now exists for the Dasma sync end to end — both directions, over real HTTP and real PostgreSQL. Two schema facts it surfaced and depends on: the migrations call `uuid_generate_v4()` without ever creating the `uuid-ossp` extension, so they fail on a brand-new database until it is installed; and `Student.ID_Number` carries a UNIQUE constraint that exists only in the migration, not on the entity — so a `synchronize`-built schema silently differs from production.

**Frontend — 17 Vitest files.** Coverage is concentrated in the campus-mode/access-status area plus the dashboards and the synced-photo fallback (`lib/synced-photo.test.ts`, `lib/image-type.test.ts`). There are still **no tests** for:

- Hooks (`src/hooks/useReportSocket.tsx`, etc.)
- `src/middleware.ts` (route protection — including the known dead `"dashboard"` matcher-string bug)
- `lib/auth-context.tsx`
- MSW mock handlers (`src/mocks/handlers/*`)

## Deep Task Verification

Deep tasks require:

1. All discovered type/lint/test/build commands for the affected app(s) (backend and/or frontend)
2. Regression test suite run
3. **If the task touches a module listed under Known Test Coverage Gaps above, write new tests as part of the task — do not rely solely on running the (nonexistent) existing suite.** This applies especially to `database-sync`, `auth`, `super-admin`, and `users`, given their risk level in `risk-register.md`.
4. Specific checks for task domain:
   - **Auth/Sessions**: Auth flow tests, permission boundary tests, explicit test of the dev-mode bypass behavior and the `login.service.ts:108` role-casing bug if touched
   - **Database Sync/BioStar**: Sync idempotency tests, `studentMutationLock` concurrency tests, external-service failure/rollback tests
   - **Reports/Gate Events**: Websocket broadcast tests, access-status mapping tests (DASMA vs MTL) if `lib/access-status.ts` is touched
   - **Schema/Migrations**: Migration up/down tests, verify against the canonical `src/config/data-source.ts` (not the dead duplicate configs)
5. Manual QA of full critical flow
6. Rollback procedure documented and tested

The strict TDD requirement and the Post-Implementation five-bucket QA gate that apply on top of this table live in `.ai-engineering/core/engineering-rules.md` and `.ai-engineering/agents/qa.md`; the enforcement mechanics are the "Strict TDD" section above.
