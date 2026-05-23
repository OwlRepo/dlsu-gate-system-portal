# File Index

Use this schema for each entry:

| File path | Purpose | Main exports | Dependencies | Consumers | Usage patterns | Risk |
|---|---|---|---|---|---|---|
| `apps/portal-web/src/lib/mock-mode.ts` | Canonical frontend mock-mode env switch helper | `isMockMode` | `process.env.NEXT_PUBLIC_MOCK_MODE` | mock provider, socket hook, dashboard flow | One source of truth for enabling/disabling frontend mocks | HIGH |
| `apps/portal-web/src/lib/report-mapper.ts` | Maps live scan data to backend report payload shape | `mapScanToReportData`, status/type/activity mappers | `@/lib/types`, `checkExpiry` | dashboard live report posting | Preserves device field and adds optional gate mapping | HIGH |
| `apps/portal-web/src/lib/column-headers.ts` | Table column config for reports/live data | `headers`, `liveDataHeaders` | none | LiveDataTable, ReportsTable containers | Includes Gate column in current behavior | MEDIUM |
| `apps/portal-web/src/lib/axios-interceptor.ts` | Shared axios interceptor for auth/session expiry behavior | default axios instance | `js-cookie`, `next/navigation` | most frontend API-consuming components | 401 handling and redirect side effects | HIGH |
