# Tests Index

| File path | Purpose | Main exports | Dependencies | Consumers | Usage patterns | Risk |
|---|---|---|---|---|---|---|
| `apps/backend/src/**/*.spec.ts` | unit/integration tests | jest test blocks | jest, nest testing | backend validation | module/service/controller tests | MEDIUM |
| `apps/backend/test/app.e2e-spec.ts` | backend e2e smoke | jest e2e suite | supertest, nest app | CI/local verification | endpoint-level behavior checks | HIGH |
| `apps/backend/test/jest-e2e.json` | e2e jest config | config JSON | jest | e2e command | test runner config | MEDIUM |
