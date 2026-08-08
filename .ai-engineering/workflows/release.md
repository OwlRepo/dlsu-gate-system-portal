# Release Workflow

Before release:

- validation complete
- review complete
- approval received when required

Never release uncertain changes automatically.

## Infra lane (Docker, CI/CD, hosting/deployment config)

This repo deploys to Windows Server 2022 via PM2 (`deployment_docs_ws2022_prod/`). Infra/deployment tasks default to Deep, but are exempt from the unit-test-first requirement in `core/engineering-rules.md` — use an operational-verification checklist instead: confirm the deployment script/config change against the actual target environment's constraints, dry-run where possible, verify process manager (PM2) behavior, and confirm rollback steps work before treating the change as done.
