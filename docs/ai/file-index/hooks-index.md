# File Index

Use this schema for each entry:

| File path | Purpose | Main exports | Dependencies | Consumers | Usage patterns | Risk |
|---|---|---|---|---|---|---|
| `apps/portal-web/src/hooks/useReportSocket.tsx` | Subscribes to gate stats stream for dashboard cards | `useReportsSocket` | `socket.io-client`, `@/lib/mock-mode`, `@/mocks/data/dashboard` | `apps/portal-web/src/app/dashboard/dashboard.tsx` | Uses live socket in normal mode, deterministic interval updates in mock mode | HIGH |
| `apps/portal-web/src/hooks/useUserToken.ts` | Reads auth token and user role context from cookie/session | `useUserToken` | cookies/session parsing | dashboard/reports/settings components | Central auth token source for frontend API calls | MEDIUM |
