# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — points at one `CONTEXT.md` per context (`apps/backend`, `apps/portal-web`). Read each one relevant to the topic.
- **`docs/adr/`** at the repo root — system-wide decisions that touch the area you're about to work in.
- **`apps/<context>/docs/adr/`** — context-scoped decisions for that app (`apps/backend/docs/adr/` or `apps/portal-web/docs/adr/`).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── apps/
    ├── backend/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← backend-specific decisions (auth, database-sync, reports, etc.)
    └── portal-web/
        ├── CONTEXT.md
        └── docs/adr/                  ← portal-web-specific decisions
```

Note: this repo uses `apps/<context>/` in place of the more generic `src/<context>/` layout — `apps/backend` (NestJS + TypeORM + PostgreSQL) and `apps/portal-web` (Next.js + React) are genuinely separate domains with different stacks, not just separate folders.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
