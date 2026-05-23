# DLSU Gate Backend - Windows Server 2022 Production Deployment

This folder is for **production on Windows Server 2022** using **NSSM Windows Services**.

The existing PM2 flow in `deployment_docs/` remains for test/staging and is not changed.

## Environment Split

- `deployment_docs/` -> Test/Staging, PM2-based
- `deployment_docs_ws2022_prod/` -> Production (Windows Server 2022), NSSM service-based

## Service Name

- `DLSUGateSystemBackend`

## Prerequisites

- Run scripts as Administrator
- Node.js installed
- NSSM installed (`nssm.exe` in PATH, or copy `nssm.exe` into this folder)
- Configured `.env` in project root

## First-time Deploy

1. Run `deploy-service.bat`
2. Validate with `status-service.bat`

Notes:

- Migration step includes fallback commands for both `src/config/data-source.ts` and `src/config/typeorm.config.ts`.
- Service install step auto-searches NSSM in common locations and attempts install via `winget`/`choco` before failing.

## Update Deploy

1. Run `update-service.bat`

## Operations

- Restart: `restart-service.bat`
- Stop: `stop-service.bat`
- Status: `status-service.bat`
- Logs: `logs-service.bat`

## Auto-start and Recovery

- Service startup is set to `Automatic`
- Service failure policy is set to restart automatically

## Reboot Verification

After a server reboot:

1. Run `status-service.bat`
2. Confirm `sc query DLSUGateSystemBackend` shows `RUNNING`
3. Confirm health/docs endpoints are reachable

## Health Endpoints

- `http://localhost:10580/health`
- `http://localhost:10580/api/docs`

## Rollback

To remove service:

```bat
nssm stop DLSUGateSystemBackend
nssm remove DLSUGateSystemBackend confirm
```

Then use the PM2 test flow from `deployment_docs/` if needed.
