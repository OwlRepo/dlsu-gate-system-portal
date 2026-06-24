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
- Default candidate commands may be mentioned but not claimed as repo-valid unless verified
- If verification command cannot run due to environment/config → mark blocker

## Command Categories

### Type Checking

Common candidates (verify before listing):

- `npm run type-check`
- `npm run tsc`
- `pnpm type-check`
- `tsc --noEmit`
- `yarn type-check`

### Linting

Common candidates (verify before listing):

- `npm run lint`
- `npm run eslint`
- `pnpm lint`
- `yarn lint`

### Unit Testing

Common candidates (verify before listing):

- `npm run test`
- `npm run test:unit`
- `npm run vitest`
- `pnpm test`
- `yarn test`

### Integration / End-to-End Testing

Common candidates (verify before listing):

- `npm run test:e2e`
- `npm run test:integration`
- `npm run cypress`
- `pnpm test:e2e`

### Build

Common candidates (verify before listing):

- `npm run build`
- `npm run build:*` (for workspace builds)
- `pnpm build`
- `yarn build`

## Deep Task Verification

Deep tasks require:

1. All type/lint/test/build commands
2. Regression test suite run
3. Specific checks for task domain:
   - **Billing/Payments**: Payment processing tests, transaction rollback tests
   - **Auth/Permissions**: Auth flow tests, permission boundary tests
   - **Jobs/Webhooks**: Job queue tests, webhook retry tests
   - **Schema/Migrations**: Schema validation, data migration tests
   - **Transactions**: Atomicity tests, concurrency tests
4. Manual QA of full critical flow
5. Rollback procedure documented and tested
