# Autonomous Cycle

Not currently activated — no cron, runner, or scheduled trigger exists for AI-workflow automation in this repo (see `runtime/scheduler.md`). These phases run in sequence **on demand**, when a session invokes them, not on a clock.

Do not confuse this with the backend's real cron jobs: `database-sync` runs at 09:00 and 21:00 Asia/Manila (see `knowledge/architecture.md`, Jobs/Automations). That schedule is production infrastructure syncing the student/employee roster and BioStar device state — unrelated to this AI-workflow cycle. Do not invent a parallel AI-schedule near those times; it is a real incident-time confusion risk in an on-call context.

## Planning phase

Product Manager role: read incoming requests, analyze requirements/unknowns/risks/dependencies, create a prioritized queue.

## Engineering phase

Coordinator role: select ready tasks, sequence roles, execute the matched workflow, create PRs, stop at `WAITING_APPROVAL` when approval is required.

## Reporting phase

Reporter role: summarize evidence, report current task state and progress, list blockers, risks, and next actions.
