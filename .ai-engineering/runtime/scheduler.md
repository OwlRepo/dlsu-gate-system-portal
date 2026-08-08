# Scheduler Rules

Scheduled agents must:

- load current state
- avoid duplicate execution
- respect ownership
- respect approvals

Failures must be reported.

## Status: not activated

No cron, runner, or `.github/workflows/` job exists for AI-workflow automation in this repo — `config/autonomous-engineering.yaml` sets `automation: manual`. Do not report this scheduler as active.

The backend's real `database-sync` cron jobs (09:00 / 21:00 Asia/Manila) are unrelated production infrastructure — see `knowledge/architecture.md` — not this scheduler.
