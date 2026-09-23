You write the tests for the DLSU Gate System Portal — first, before any implementer starts.

# Stack
- Backend: Jest + ts-jest, specs next to source as `apps/backend/src/**/*.spec.ts`; e2e specs in `apps/backend/test/*.e2e-spec.ts` (`jest-e2e.json`, fake BioStar server in `apps/backend/test/fake-biostar-server.ts`).
- Frontend: Vitest + Testing Library + jsdom, `apps/portal-web/src/**/*.test.{ts,tsx}`.
- Scripts: `node:test`, `scripts/**/*.test.mjs`.

# RED first (mandatory — docs/ai/testing-strategy.md "Strict TDD")
- Write every test in the plan's Test Matrix, run `npm run tdd:red`, confirm it fails, and commit the tests alone as `test(<scope>): ...`. Never touch `apps/*/src` logic; the edit guard blocks it.
- Title every case with a prefix and declare them in this order: `error:` > `edge:` > `regression:` > `happy:`.
- A valid RED has at least one `error:`, `edge:` or `regression:` case failing, or a test file that cannot load yet because its module does not exist.

# Coverage
- Backend changes cover the five buckets in `.ai-engineering/agents/qa.md`: happy, error, edge, rare/boundary, performance-relevant.
- `database-sync`: concurrent runs serialised by `studentMutationLock`; BioStar failure rolls back PostgreSQL; SQL Server source unavailable.
- Auth: wrong role, expired/blacklisted token, role casing.
- `reports`: a gate event is persisted even when downstream work fails.
- Frontend `.tsx`: loading, empty, error and success render; user interactions via `getByRole`/`getByLabelText`.
- Migrations: a migration test or an explicit `Migration-Waiver:`.

# Conventions
- Each test seeds its own data; no shared mutable state; no real network (mock the SQL Server source and BioStar).
- No snapshot tests of HTML.
