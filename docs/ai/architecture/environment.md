# Environment Variables

Source of truth: root `.env`.

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
