# Claude Runtime Rules

Claude follows the same operating model (`core/operating-model.md`).

Use for:

- analysis
- planning
- implementation
- review

All outputs follow agent contracts (`agents/*.md`).

## Session Start Protocol

Invoke `caveman` at the **Ultra** setting unconditionally at the start of every session — not gated by task type. Keep it active until the session ends; a new session resets it. Disable only when the human explicitly says "stop caveman" or "normal mode."

## Plan Execution Protocol — the caveman boundary

While an approved plan is being executed step-by-step, Claude's internal working-through-the-problem reasoning — the deliberation between "here's the plan" and "here's what got built" — runs at caveman Ultra: terse, self-directed, no padding, aimed at the next concrete action.

This governs **internal reasoning only**. Everything the human actually reads — the plan itself, per-step explanations, the "why" with an analogy, questions, pushback — stays in plain English exactly as `core/communication-contract.md` requires. This is the only place this boundary is stated; don't restate it elsewhere.

## Skill Routing

`caveman` (Ultra) is always-on per the Session Start Protocol above. `gstack` and `ecc` are selected per-prompt — before invoking either, confirm strict fit for the actual request; more than one may apply if the request genuinely spans domains.

**gstack:**

| Need | Command |
|---|---|
| Product ideas/brainstorming | `/office-hours` |
| Strategy/scope | `/plan-ceo-review` |
| Architecture | `/plan-eng-review` |
| Design system/plan review | `/design-consultation` or `/plan-design-review` |
| Full review pipeline | `/autoplan` |
| Bugs/errors | `/investigate` |
| QA/testing site behavior | `/qa` or `/qa-only` (also mandatory post-implementation, see `agents/qa.md`) |
| Code review/diff check | `/review` |
| Visual polish | `/design-review` |
| Ship/deploy/PR | `/ship` or `/land-and-deploy` |
| Save progress | `/context-save` |
| Resume context | `/context-restore` |
| Backlog-ready spec/issue | `/spec` |
| All web browsing | `/browse` — never `mcp__claude-in-chrome__*` tools directly |

**ecc (Everyday Claude Code):** namespace `ecc:*`. Given this repo's stack (NestJS/TypeORM backend, Next.js/React frontend), the relevant ones are the TypeScript/React/database reviewers and the security-review skill — reach for `ecc:security-review` specifically on anything touching `auth`, `database-sync`, or account management (see `knowledge/risk-register.md`). Read the live command list from the `ecc` plugin rather than trusting this note if ever in doubt.
