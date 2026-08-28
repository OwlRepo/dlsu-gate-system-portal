# DLSU Gate System Portal Monorepo

This repository contains the DLSU Gate System as a monorepo:
- `apps/backend` -> NestJS backend API
- `apps/portal-web` -> Next.js frontend portal

Environment is centralized at the repository root:
- `.env` (local/runtime values)
- `.env.example` (template)

## Prerequisites
- Node.js 18+
- Bun 1.2+
- PostgreSQL (for backend)
- Optional: Redis / source DB / BioStar services depending on features used

## Local Development
1. Install dependencies:
```bash
bun install
```

2. Configure environment:
```bash
cp .env.example .env
```
Then update values as needed.

3. Validate environment keys:
```bash
bun run verify:env:backend
bun run verify:env:web
```

4. Run both apps in development mode:
```bash
bun run dev
```

Default ports:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:10580`
- Backend docs: `http://localhost:10580/api/docs`
- Backend health: `http://localhost:10580/health`

### Run Individually
- Backend only:
```bash
bun run dev:backend
```
- Frontend only:
```bash
bun run dev:web
```

## Build and Verification
- Build both apps:
```bash
bun run build
```
- Build backend only:
```bash
bun run build:backend
```
- Build frontend only:
```bash
bun run build:web
```
- Lint:
```bash
bun run lint
```
- Type check:
```bash
bun run check-types
```

## Backend Testing and DB Scripts
- Unit tests:
```bash
bun --cwd apps/backend run test
```
- Watch tests:
```bash
bun --cwd apps/backend run test:watch
```
- E2E tests:
```bash
bun --cwd apps/backend run test:e2e
```
- Run migrations:
```bash
bun --cwd apps/backend run migration:run
```
- Generate migration:
```bash
bun --cwd apps/backend run migration:generate
```

## Windows Server 2022 Deployment (NSSM)
Deployment scripts are in:
- `deployment_docs_ws2022_prod/`

Service name:
- `DLSUGateMonorepo`

### First-Time Deploy
Run as **Administrator** in CMD or PowerShell:
```bat
deployment_docs_ws2022_prod\deploy-monorepo.bat
```

What it does:
- preflight checks (admin, ports, `.env`, tooling)
- dependency install
- backend/frontend build
- backend migration run
- install/start NSSM service
- readiness checks for backend + frontend

### Update Deploy
```bat
deployment_docs_ws2022_prod\update-monorepo.bat
```

## Operations / Troubleshooting Scripts
From repository root on WS2022:

- Service and health status:
```bat
deployment_docs_ws2022_prod\status-monorepo.bat
```

- Live logs (backend + frontend + service):
```bat
deployment_docs_ws2022_prod\logs-monorepo.bat
```

- Restart service:
```bat
deployment_docs_ws2022_prod\restart-monorepo.bat
```

- Stop service:
```bat
deployment_docs_ws2022_prod\stop-monorepo.bat
```

### Log Locations
- Per-run logs:
  - `deployment_docs_ws2022_prod/logs/<timestamp>/`
- Latest logs snapshot:
  - `deployment_docs_ws2022_prod/logs/current/`

## Exit Codes (Deployment)
- `10` prerequisites/admin failure
- `20` env/port validation failure
- `30` dependency install failure
- `40` build failure
- `50` migration failure
- `60` service install/start failure
- `70` readiness/health failure

## AI Integration
- Start with `CLAUDE.md` — it routes into the operating layer.
- The operating layer lives in `.ai-engineering/`; `.ai-engineering/MANIFEST.md` is the authoritative file list.
- VS Code task integration: `.vscode/tasks.json`

## Notes
- Do not commit real secrets to git.
- Root `.env` is the shared configuration source for both apps.
