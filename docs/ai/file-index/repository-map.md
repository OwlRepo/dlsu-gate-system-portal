# Repository Map

Purpose:

Locate key files and directories quickly.

This file is map only.

It is not proof of behavior.

Use this to find likely files before detailed inspection.

Verify all conclusions against real source code.

If this map is stale, mark `CONTEXT DRIFT`.

## Root-Level Configuration

| File / Directory | Purpose | Status |
| --- | --- | --- |
| `package.json` | Workspace root definition | [verify] |
| `pnpm-workspace.yaml` | PNPM workspace config | [verify] |
| `tsconfig.json` | TypeScript root config | [verify] |
| `.env.example` | Environment template | [verify] |
| `.gitignore` | Git ignore rules | [verify] |
| `turbo.json` | Turborepo config (if used) | [verify] |
| `docker-compose.yml` | Local services config | [verify] |

## Frontend Application

| Directory | Purpose | Key Files | Status |
| --- | --- | --- | --- |
| `apps/portal-web/` | Frontend app root | [verify] | [verify] |
| `apps/portal-web/src/` | Source code | [verify] | [verify] |
| `apps/portal-web/src/app/` | Next.js pages/routes | [verify] | [verify] |
| `apps/portal-web/src/components/` | React components | [verify] | [verify] |
| `apps/portal-web/src/lib/` | Utilities and helpers | [verify] | [verify] |
| `apps/portal-web/src/mocks/` | Mock data and handlers | [verify] | [verify] |
| `apps/portal-web/src/styles/` | Styling | [verify] | [verify] |
| `apps/portal-web/public/` | Static assets | [verify] | [verify] |

## Backend Application

| Directory | Purpose | Key Files | Status |
| --- | --- | --- | --- |
| `apps/backend/` | Backend app root | [verify] | [verify] |
| `apps/backend/src/` | Source code | [verify] | [verify] |
| `apps/backend/src/main.ts` | Entry point | [verify] | [verify] |
| `apps/backend/src/app.module.ts` | Root module | [verify] | [verify] |
| `apps/backend/database/` | Database migrations | [verify] | [verify] |

## Shared Packages

| Directory | Purpose | Status |
| --- | --- | --- |
| `packages/` | Shared packages | [verify] |

## Tests

| Directory | Purpose | Status |
| --- | --- | --- |
| `test/` | Test suite root | [verify] |
| `test/unit/` | Unit tests | [verify] |
| `test/integration/` | Integration tests | [verify] |
| `test/e2e/` | E2E tests | [verify] |

## Documentation

| Directory | Purpose | Status |
| --- | --- | --- |
| `docs/` | Documentation root | [verify] |
| `docs/ai/` | AI workflow docs | [verify] |
| `docs/api/` | API documentation | [verify] |
| `docs/deployment/` | Deployment guides | [verify] |

## Development & Deployment

| Directory | Purpose | Status |
| --- | --- | --- |
| `scripts/` | Utility scripts | [verify] |
| `deployment_docs_*/` | Deployment documentation | [verify] |

## Update Status

Last refreshed: [when context refresh is run]

Stale entries: [list if any]

Missing entries: [list if any]
