# DLSU Portal FE - Windows Server 2022 Production Deployment

This folder is for **production on Windows Server 2022** using **NSSM Windows Services**.

The existing PM2 flow in `deployment_docs/` remains for test/staging and is not changed.

## Environment Split

- `deployment_docs/` -> Test/Staging, PM2-based
- `deployment_docs_ws2022_prod/` -> Production (Windows Server 2022), NSSM service-based

## Service Name

- `DLSUPortalFrontend`

## Prerequisites

- Run scripts as Administrator
- Node.js installed
- NSSM installed (`nssm.exe` in PATH, or copy `nssm.exe` into this folder)

## First-time Deploy

1. Run `deploy-service.bat`
2. Validate with `status-service.bat`

Note: `deploy-service.bat` includes automatic repair for missing `lucide-react` type declarations on Windows Server (it retries build once after repair).

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
2. Confirm `sc query DLSUPortalFrontend` shows `RUNNING`
3. Confirm `http://localhost:3000` is reachable

## Rollback

To remove service:

```bat
nssm stop DLSUPortalFrontend
nssm remove DLSUPortalFrontend confirm
```

Then use the PM2 test flow from `deployment_docs/` if needed.
