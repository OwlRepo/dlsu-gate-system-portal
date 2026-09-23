# Environment

Source of truth: root `.env`.

## Detected Stack

| Area | Detected |
|---|---|
| Project type | Monorepo (fullstack) |
| Runtime | Node.js (`>=18` root engines) |
| Primary package manager | Bun (`packageManager: bun@1.2.22`) |
| Build system | Turborepo (`turbo.json`) |
| Frontend framework | Next.js 15 (`apps/portal-web`) |
| Backend framework | NestJS 11 (`apps/backend`) |
| Language | TypeScript |
| Tests | Jest (backend unit + e2e), Vitest (frontend) |
| Linting | ESLint |
| Formatting | Prettier |
| Database | PostgreSQL + SQL Server source sync |
| ORM | TypeORM |
| Auth | JWT + role guards (backend) |
| Deployment target | Windows Server 2022 (NSSM service scripts, PM2 process management) — see `deployment_docs_ws2022_prod/` |
| CI/CD | Jenkinsfile detected in backend history; no root CI workflow (`.github/workflows/`) detected |
| Env files | Root `.env` (authoritative), root `.env.example` |

## Shared
| Name | Purpose | Required | Local usage | Production usage | Affected modules |
|---|---|---|---|---|---|
| `NODE_ENV` | runtime mode | Yes | dev/prod behavior | service runtime mode | backend + frontend wrappers |
| `BASE_URL` | base URL reference | Optional | local URL composition | service URL composition | backend helpers |
| `DOCKER_ENVIRONMENT` | docker flag | Optional | local docker behavior | deployment environment hint | backend config |
| `USE_HOST_DOCKER_INTERNAL` | docker host routing toggle | Optional | local docker networking | server docker networking | backend config |

## Backend (`apps/backend`)
| Name | Purpose | Required | Local usage | Production usage | Affected modules |
|---|---|---|---|---|---|
| `PORT` | backend listen port | Yes | `10580` dev | service port | `src/main.ts` |
| `JWT_SECRET` | JWT signing key | Yes | auth token signing | auth token signing | auth/login modules |
| `DATABASE_URL` | DB URL override | Optional | local/remote db url | production db url | TypeORM data sources |
| `DB_HOST` `DB_PORT` `DB_USERNAME` `DB_PASSWORD` `DB_NAME` | primary postgres settings | Yes | dev postgres | production postgres | db config, app module |
| `SOURCE_DB_*` | source SQL Server sync | Yes (for sync features) | sync operations | scheduled sync | database-sync services |
| `SOURCE_DB_SCHEMA_ENV` | source schema selector (`dasma` or fallback `main`) | Yes | local sync path selection | production sync path selection | database-sync service/path facade |
| `ENABLE_BIOSTAR_SYNC` | backend BioStar sync feature flag | Yes for multi-campus gating | toggles BioStar sync endpoints/internal paths | toggles BioStar sync by deployment | database-sync service/controller |
| `BIOSTAR_API_BASE_URL` `BIOSTAR_API_LOGIN_ID` `BIOSTAR_API_PASSWORD` | BioStar backend integration | Yes (for BioStar features) | local integration | production integration | database-sync services |
| `POLLING_INTERVAL` | report polling interval | Optional | websocket polling | websocket polling | reports gateway |
| `SYNC_BATCH_SIZE` | sync batch size | Optional | batch tuning | batch tuning | database-sync services |

## Frontend (`apps/portal-web`)
| Name | Purpose | Required | Local usage | Production usage | Affected modules |
|---|---|---|---|---|---|
| `FRONTEND_PORT` | Next dev/start port | Yes | `3000` | frontend service port | root env wrapper |
| `NEXT_PUBLIC_API_URL` | backend API base URL | Yes | browser API calls | browser API calls | frontend data fetching |
| `NEXT_PUBLIC_WS_HOST` | websocket host | Yes | websocket pages | websocket pages | dashboard/employee views |
| `NEXT_PUBLIC_MOCK_MODE` | global frontend mock switch | Optional (default false) | enables MSW + local mock stream behavior | generally disabled in production | mock provider, dashboard, socket hook |
| `NEXT_PUBLIC_CAMPUS` | campus label used by frontend deployment context | Optional | local campus context | campus-specific deployments | settings/feature gating paths |
| `NEXT_PUBLIC_ENABLE_BIOSTAR_SYNC` | frontend BioStar controls feature flag | Optional | shows/hides Biostar-only controls | deployment-specific visibility | operation settings UI |
| `NEXT_PUBLIC_BIOSTAR_API` | BioStar API URL from frontend routes | Yes (current behavior) | API proxy routes | API proxy routes | `src/app/api/*` |
| `NEXT_PUBLIC_BIOSTAR_LOGIN_ID` `NEXT_PUBLIC_BIOSTAR_PASSWORD` | public client credentials (current behavior) | Yes (current behavior) | login payloads | login payloads | user/settings/dashboard forms |

Never print real secret values in docs or logs.

## Campus Mode Pairing (Required for status behavior)
- Dasma deployment:
  - `SOURCE_DB_SCHEMA_ENV=dasma`
  - `NEXT_PUBLIC_CAMPUS=DASMA`
- Main/Taft/Laguna deployment:
  - `SOURCE_DB_SCHEMA_ENV` set to any non-`dasma` value
  - `NEXT_PUBLIC_CAMPUS=MAIN` or `TAFT` or `LAGUNA`

Frontend code falls back to Dasma-compatible behavior when `NEXT_PUBLIC_CAMPUS` is missing or invalid and logs a non-production warning.

## Dev Commands Quick Reference

(Full verified command tables with notes are in `testing-strategy.md` — this is a fast-lookup subset.)

| Capability | Command |
|---|---|
| install | `bun install` |
| dev (all) | `bun run dev` |
| dev (backend) | `bun run dev:backend` |
| dev (web) | `bun run dev:web` |
| build (all) | `bun run build` |
| build (backend) | `bun run build:backend` |
| build (web) | `bun run build:web` |
| lint | `bun run lint` |
| typecheck | `bun run check-types` |
| format | `bun run format` |
| test (backend) | `bun --cwd apps/backend run test` |
| test:watch (backend) | `bun --cwd apps/backend run test:watch` |
| e2e (backend) | `bun --cwd apps/backend run test:e2e` |
| db:migrate | `bun --cwd apps/backend run migration:run` |
| db:generate | `bun --cwd apps/backend run migration:generate` |
