# File Index

Use this schema for each entry:

| File path | Purpose | Main exports | Dependencies | Consumers | Usage patterns | Risk |
|---|---|---|---|---|---|---|
| `apps/portal-web/src/components/providers/mock-mode-provider.tsx` | Bootstraps MSW in frontend mock mode before app usage | `MockModeProvider` | `@/lib/mock-mode`, `@/mocks/browser`, React hooks | `apps/portal-web/src/app/layout.tsx` | Wraps app shell and delays render until mock worker starts when enabled | HIGH |
| `apps/portal-web/src/components/reports/GateUsageChart.tsx` | Renders gate usage trends chart with loading/empty states | `GateUsageChart` | `recharts` | `apps/portal-web/src/components/reports/ReportsPageContainer.tsx` | Displays report analytics grouped by gate | MEDIUM |
| `apps/portal-web/src/components/settings/operation-settings.tsx` | Sync operations UI with BioStar feature-gate behavior | `OperationSettings` | `axios-interceptor`, cookies, toast hooks | settings route | Calls database-sync APIs and conditionally renders BioStar controls | HIGH |
