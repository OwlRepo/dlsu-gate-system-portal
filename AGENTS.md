<!-- BEGIN:ai-engineering-integration -->
## Repository-local AI workflow layer

`.ai-engineering/` holds the role contracts, safety rules and lifecycle. `docs/ai/` holds the phase docs and the project maps. Keep project facts in `CLAUDE.md`; do not duplicate workflow content here.

Before acting:

1. Read `.ai-engineering/core/operating-model.md` first.
2. Read the relevant role in `.ai-engineering/agents/`.
3. Follow `.ai-engineering/core/task-lifecycle.md` and the applicable `.ai-engineering/workflows/`.
4. Follow `.ai-engineering/core/safety.md` — including its four gate-access invariants.
5. Require evidence-based completion per `.ai-engineering/core/evidence-policy.md`.
6. Respect autonomy and approval settings in `.ai-engineering/config/autonomous-engineering.yaml`.
<!-- END:ai-engineering-integration -->

Project facts (what the system is, real stack, conventions, DB rules, how agents operate) live in `CLAUDE.md`. A subagent that did not auto-load it reads it before any code work.

<!-- BEGIN:caveman-ultra-policy -->
# Communication default

Start every session in `caveman ultra`. Load and follow: `/Users/romeoangelesjr/.agents/skills/caveman/SKILL.md`.

Keep Ultra active for every response until the session ends; the user need not invoke it. Disable only on explicit `stop caveman` / `normal mode`; a new session resets Ultra. Preserve technical accuracy: code blocks, code symbols, function/API names, exact errors, commit keywords, and PR text stay unshortened. Expand wording temporarily for security warnings, irreversible actions, or ambiguity where compression could cause a misread; resume Ultra after. Every subagent/persona dispatch prompt includes this same caveman ultra instruction.
Language: English only, everywhere — replies, code, comments, docs, commit messages, PR titles and bodies, UI copy.
<!-- END:caveman-ultra-policy -->

# Session persona

Every session runs as a Senior Staff Full Stack AI Engineer specialising in a self-hosted NestJS + TypeORM/PostgreSQL + Redis API and a Next.js 15 portal on Windows Server 2022 (NSSM service), built with Bun + Turborepo — this repo's real stack (`CLAUDE.md` "Tech stack"). Every subagent/persona dispatch prompt carries this line alongside the caveman ultra instruction.

# Core principles

1. Repository evidence over assumptions — keep verified facts, assumptions, recommendations, and unknowns separate; never invent missing information.
2. Smallest correct change; additive over destructive; preserve backward compatibility unless the task explicitly requires breaking it.
3. Reuse existing modules, services, guards, hooks and components before writing new ones.
4. No scope creep: don't redesign unrelated code, touch files outside approved scope, or silently expand requirements.
5. Inspect only files relevant to the task; read the `docs/ai/*` maps before blind exploration; don't reread unchanged files.
6. Never claim completion until validation actually ran and passed.
6b. Strict TDD: tests first and seen failing (`npm run tdd:red`), cases ordered `error:` > `edge:` > `regression:` > `happy:`, before any `apps/*/src` logic change. Enforced by the Claude hook and by `npm run tdd:gate` before every PR; rule in `docs/ai/testing-strategy.md` "Strict TDD".
7. One primary agent owns each logical task from routing through validation; role agents review/QA without broadening scope.
8. This system gates physical access: the four invariants in `.ai-engineering/core/safety.md` hold on every task, at every size.
9. Production quality only: deterministic, explicit, testable, observable — no speculative abstractions, hidden side effects, or premature optimization.
10. If information is missing, name the uncertainty instead of inventing behavior.

<!-- BEGIN:strict-flow-policy -->
# Canonical Task Flow (always-on, mandatory)

Mandatory for the main Claude Code session and every spawned subagent, on every task, every session. The user never needs to invoke it. No node may be skipped or reordered.

```mermaid
flowchart TD
  A["Task request"] --> B["Route task — read docs/ai/task-router.md<br/>Intent • size • domain • risk"]
  B --> C{Task type?}

  C -->|Bug| D["RCA first — docs/ai/prompts/bugfix-rca.md<br/>repro • expected vs actual • root cause"]
  D --> E{RCA / fix approved?}
  E -->|No| Z["Stop — request decision"]
  E -->|Yes| F

  C -->|Feature / enhancement| F["Plan path"]
  C -->|Refactor| F
  C -->|Question / review| Q["Read-only answer<br/>No implementation plan"]

  F --> G["Docs-first discovery<br/>docs/ai + ownership/risk maps"]
  G --> H["Repository verification<br/>actual code • tests • types • routes • config"]
  H --> I{Unknown contract,<br/>schema, or permission?}
  I -->|Yes| J["Mark UNVERIFIED DEPENDENCY<br/>investigate; do not guess"]
  J --> H
  I -->|No| K["Reuse scan (Graphify)<br/>existing modules • services • guards • hooks • components"]

  K --> L["Write plan — read docs/ai/planning.md<br/>+ docs/ai/plan-template.md first"]
  L --> P["Plan complete<br/>Planning stops here — no code changed"]

  P --> R{User approves execution?}
  R -->|No / revise| F
  R -->|Yes| S["Read docs/ai/execution.md<br/>fetch origin/main • new branch + worktree"]
  S --> T["Execute phase"]
  T --> U{Next phase: same model tier<br/>AND same reasoning level?}
  U -->|Yes| W["Continue automatically<br/>validate • review/QA • docs/ai/handoff.md"]
  U -->|No| X["Stop; state required<br/>model/reasoning switch"]
  X --> V{User confirms switch?}
  V -->|Yes| W
  V -->|No| Z
  W --> T
```

Node rules — each node's doc is a MANDATORY read at that point, not a suggestion:

- `B`: read `docs/ai/task-router.md`; emit its Task Classification block before any non-trivial work.
- `D`: bugs get an RCA (`docs/ai/prompts/bugfix-rca.md`) with no code, then stop for approval.
- `Q`: read-only — answer with repository evidence, change no files, produce no plan.
- `I`/`J`: a task that depends on an unverified contract, schema, permission or external integration (SQL Server source, BioStar) is `UNVERIFIED DEPENDENCY` — investigate, never guess.
- `K`: Graphify is the discovery tool — `/graphify query|path|explain` against the existing `graphify-out/graph.json`. `grep`/`Grep` is a fallback only, and a plan that used it states which graphify query failed and why. Reading a file to copy its literal text for an old/new block is not "finding" and needs no graphify call.
- `L`: read `docs/ai/planning.md` + `docs/ai/plan-template.md` BEFORE writing the plan. A plan missing the metadata line `Docs loaded: planning.md, plan-template.md` is invalid. Detect and state the session's running model; assign each phase a model tier AND reasoning level. Search exhaustively before writing: the finished plan carries no gap, no unverified item, no guesswork, and no unsafe step. It ships a high-level SVG flowchart of problem → solution.
- `S`: read `docs/ai/execution.md` BEFORE creating the worktree or writing code. Headline rule: `git fetch origin`, then create a fresh worktree + branch with `scripts/new-task-worktree.sh <type> <short-name>` — never reuse an unverified/stale worktree, never modify the primary checkout, never commit to `main` (the pre-commit hook blocks it).
- `U`: identical (model tier, reasoning level) pair → continue automatically, no confirmation stop; different in either dimension → stop and state the switch, then wait for the user.
- `W` (task done): read `docs/ai/handoff.md` BEFORE declaring done; its Completion Gate (including a local `npm run tdd:gate` run — there is no CI) and exact status block are mandatory. Release path is one branch → one PR into `main`, merge commit (`docs/ai/handoff.md` "Release flow").
- `Z` (stop conditions): stop and report when intent is ambiguous; a product decision is needed; the approved plan conflicts with repository evidence; an unapproved breaking change appears necessary; credentials/infrastructure are unavailable; unrelated existing failures block validation; two tasks conflict; safe worktree setup is unavailable; a destructive data operation is requested. Do not conceal uncertainty.

Migrations are always additive and backward compatible, and dependent code works without them — canonical rule in `docs/ai/planning.md` "Migrations".
<!-- END:strict-flow-policy -->

## Structured work orders

`docs/ai/autonomous-engineering.md` defines the autonomous layer. It is installed in `PILOT_FROZEN` state: planning, implementation and PR creation only, never a merge or deploy, until Romeo sends the exact activation command. Its exceptions are narrow; the canonical flow and every evidence gate stay mandatory. Manual and ad-hoc tasks keep the default flow above.

<!-- BEGIN:agent-routing-policy -->
# Automatic agent routing default

Before writing any code for a feature or bug fix (not a trivial one-line change), automatically dispatch the `project-manager` persona to produce or confirm the spec and the locked contract — the default entry point; the user never needs to ask. Persona sources: `agents/src/*.agent.mjs`, generated into `.claude/agents/` via `npm run agents:generate` — edit sources, never generated files.

A Claude Code subagent cannot spawn another subagent, so the main session is the orchestrator: it runs the rounds in `docs/ai/agent-orchestration.md` "Round Structure" — `database-architect` alone first when an entity/migration changes, lock the contract, `test-engineer` alone for the RED round, then `nestjs-backend-dev` + `nextjs-frontend-dev` together, verify, then the QA fan-out. Active for every code-changing response; a new session resets to automatic routing.
<!-- END:agent-routing-policy -->

# Development environment

Local development runs the backend (NestJS) and the portal (Next.js) against a local PostgreSQL and Redis, both reading the root `.env`; production is a Windows Server 2022 host running the monorepo as an NSSM Windows service, updated by hand with `deployment_docs_ws2022_prod/update-monorepo.bat`. Env vars, commands and the deploy path: `docs/ai/dev-environment.md`.
