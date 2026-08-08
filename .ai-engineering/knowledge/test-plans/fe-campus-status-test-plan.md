# Frontend Test Plan: Campus-Aware Access Status (MTL vs Dasma)

## Scope
- Validates frontend behavior changes introduced by campus-aware status normalization.
- Covers utility logic, status visuals, report labels, and remarks visibility.
- Applies to:
  - `apps/portal-web/src/lib/campus-mode.ts`
  - `apps/portal-web/src/lib/access-status.ts`
  - `apps/portal-web/src/lib/report-mapper.ts`
  - `apps/portal-web/src/components/dashboard/live-data-table.tsx`
  - `apps/portal-web/src/components/custom/CustomTable.tsx`
  - `apps/portal-web/src/components/employee-dashboard/TurnstileGrid.tsx`
  - `apps/portal-web/src/components/employee-dashboard/EntriesLog.tsx`
  - `apps/portal-web/src/components/reports/ReportsPageContainer.tsx`
  - `apps/portal-web/src/components/reports/ReportsTable.tsx`
  - `apps/portal-web/src/components/dashboard/gate-access-stats.tsx`

## Test Layers

### 1) Unit Tests (Required)
- `campus-mode.test.ts`
  - `NEXT_PUBLIC_CAMPUS=DASMA` -> `DASMA`
  - `NEXT_PUBLIC_CAMPUS=MAIN|TAFT|LAGUNA` -> `MTL`
  - unknown/missing campus -> fallback `DASMA`
  - non-production warning emitted for invalid campus
  - no warning in production
- `access-status.test.ts`
  - MTL active with remarks -> `GREEN`, `Allowed`, `showRemarks=false`
  - MTL denied (expired/disabled/APB) -> `RED`, `Not Allowed`, `showRemarks=false`
  - Dasma active with remarks -> `YELLOW`, `Allowed with remarks`, `showRemarks=true`
  - Dasma active without remarks -> `GREEN`, `Allowed`, `showRemarks=true`
  - legacy status serialization strings remain stable

### 2) Component Tests (Planned Next)
- `LiveDataTable`
  - status label changes by mode (`Allowed` vs `Allowed with remarks`)
  - remarks block hidden in MTL, shown in Dasma
- `CustomTable` (live mode)
  - status dot resolves from shared mapper (`GREEN`/`YELLOW`/`RED`)
- `TurnstileGrid` and `EntriesLog`
  - card border color matches mapper
  - remarks section visibility follows mode
- `ReportsTable` + `ReportsPageContainer`
  - dot color uses `STATUS_CODE`
  - text status in MTL is binary only
  - report details remarks hidden in MTL and shown in Dasma
- `GateAccessStats`
  - MTL hides "Allowed with Remarks"
  - MTL allowed value equals `allowed + allowedWithRemarks`
  - Dasma still shows 3 buckets

### 3) Integration/Smoke UI Checks (Planned Next)
- MTL deployment env (`NEXT_PUBLIC_CAMPUS=MAIN`)
  - dashboard, employee dashboard, reports screens show binary behavior
- Dasma deployment env (`NEXT_PUBLIC_CAMPUS=DASMA`)
  - legacy yellow/remarks behavior preserved
- Invalid env value
  - app logs warning in non-production and defaults to Dasma behavior

## Behavior Matrix
| Mode | Active User + Remarks | Active User + No Remarks | Disabled/Expired/APB | Remarks Visibility |
|---|---|---|---|---|
| MTL | Allowed + Green | Allowed + Green | Not Allowed + Red | Hidden |
| DASMA | Allowed with remarks + Yellow | Allowed + Green | Not Allowed + Red | Visible |

## Fixtures and Test Data
- Reuse representative `ScanProps` fixture variants:
  - active with remarks
  - active no remarks
  - disabled
  - expired
  - APB event
- Use deterministic timestamps for expiry checks.

## Commands
- Run all frontend tests: `cd apps/portal-web && bun run test`
- Watch mode: `cd apps/portal-web && bun run test:watch`
- Coverage report: `cd apps/portal-web && bun run test:coverage`

## Exit Criteria
- All unit tests pass.
- New component tests (once added) pass in CI/local.
- No regression in MTL binary behavior and Dasma remarks behavior across key screens.
