# DLSU Monorepo WS2022 Deployment

## Service
- Name: `DLSUGateMonorepo`
- Topology: single NSSM service running backend + frontend orchestrator.

## Scripts
- `deploy-monorepo.bat` fresh deploy
- `update-monorepo.bat` pull + deploy
- `status-monorepo.bat` service + health checks
- `logs-monorepo.bat` live log tail
- `restart-monorepo.bat` restart service
- `stop-monorepo.bat` stop service

## Exit Codes
- `10` prerequisites/admin failure
- `20` env/port validation failure
- `30` dependency install failure
- `40` build failure
- `50` migration failure
- `60` service install/start failure
- `70` readiness/health failure

## Logs
Per-run logs are created at `deployment_docs_ws2022_prod/logs/<timestamp>/` and mirrored to `logs/current/`.
