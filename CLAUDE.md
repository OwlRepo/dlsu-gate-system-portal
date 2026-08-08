# CLAUDE.md — DLSU Gate System Portal

Router only. The operating layer lives in `.ai-engineering/` — this file points into it, it does not restate it.

**Project:** DLSU Gate System Portal — a production university physical-access-control system. `apps/backend` (NestJS + TypeORM + PostgreSQL + Redis) syncs a student/employee roster from an external SQL Server source and a BioStar (Suprema) physical access-control device network, issues JWT-based auth, and logs every gate entry/exit decision. `apps/portal-web` (Next.js 15 + React 19) is the admin/employee dashboard. This is production infrastructure controlling real building/gate access.

## Start here, every session

1. `.ai-engineering/core/constitution.md` — the non-negotiable principles.
2. `.ai-engineering/runtime/claude.md` — session start protocol (caveman Ultra), skill routing, the boundary between internal reasoning and what you show the user.
3. `.ai-engineering/workflows/task-intake.md` — classify the incoming request before acting.
4. `.ai-engineering/knowledge/` — real project facts (architecture, contracts, ownership, risk, testing commands). Maps only, never proof — if a map conflicts with source code, source code wins.

## Non-negotiables (see `.ai-engineering/core/` for the full text)

- **Source of truth is code, not docs.** `.ai-engineering/knowledge/*` are maps; verify against real source before relying on them for a Deep task.
- **This system gates physical access.** `.ai-engineering/core/safety.md` has four project invariants that hold regardless of task size — read them before touching `auth`, `database-sync`, or `reports`.
- **Strict TDD + a five-bucket QA gate** apply to every change — see `.ai-engineering/core/engineering-rules.md` and `.ai-engineering/agents/qa.md`.
- **Communication style is fixed** — simple English, an analogy per technical term, plan before implementing, one step at a time. See `.ai-engineering/core/communication-contract.md`.
- **Single-agent operation** — Claude adopts the roles in `.ai-engineering/agents/` sequentially in one thread; there is no separate dispatched Codex or sub-agent layer. See `.ai-engineering/core/operating-model.md`.

## Full inventory

`.ai-engineering/MANIFEST.md` is the authoritative file list. Adding a file to `.ai-engineering/` requires declaring it there in the same change.

## If Codex-era files reappear

This repo removed its Codex/ChatGPT-era AI layer on 2026-07-08 (`AGENTS.md`, `.codex/`, `CLAUDE_CODEX.md`, `.ai-scratchpad.md`, `.claude/settings.example.json`). If any of these resurface, flag it and ask before assuming it was intentional — see `.ai-engineering/MANIFEST.md`'s Codex-leftover guard.
