# Autonomous Engineering (installed, PILOT_FROZEN)

> Purpose: the contract for structured, authorized work orders. It adds narrow exceptions to the `AGENTS.md` flow; it never weakens planning, testing, review, QA, handoff, migration or production gates.
> Scope: this repository only. State: `PILOT_FROZEN` (`.ai-engineering/config/autonomous-engineering.yaml` `pilot.activation`).

## Current state

- **Activation:** `PILOT_FROZEN`. Agents may plan, implement, review, QA and open a PR for an authorized work order. They may **not** merge, release, deploy, migrate production, or mark a task complete.
- **Scheduler:** none (`automation: manual`). Nothing runs on a clock; every run starts from a session Romeo opens (`.ai-engineering/runtime/scheduler.md`).
- **Task source:** Linear. There is no API path (`docs/agents/issue-tracker.md`): Romeo pastes the issue into the session. The pasted issue is the work order.
- **CI:** none. Every gate that CI would run is run locally and pasted into the PR (`docs/ai/handoff.md`).

## Work order shape

A pasted Linear issue is a valid work order only when it carries, or the planning-triage pass derives and Romeo confirms:

- a one-line **outcome**,
- numbered **acceptance criteria** (Given / when / then),
- **sources** (the issue, meeting notes, or files it cites) — each one read,
- **constraints** (behaviour that must not change),
- **mode**: `AUTO` (plan + implement + PR), `DISCUSS` (investigate and plan only), `HOLD` (do nothing).

Missing fields, placeholder text or contradictory evidence → `NEEDS_INPUT`; ask once, do not guess.

Before planning, compare every acceptance criterion against freshly fetched `origin/main`. If all are already met, record `SKIPPED_ALREADY_IMPLEMENTED` with the SHA and the file/test evidence and create no branch, worktree, plan or PR. If some are met, plan only the gap.

## Risk and authorization

Risk comes from `docs/ai/task-router.md` sizes and `docs/ai/risk-register.md`:

| Risk | Meaning | While `PILOT_FROZEN` |
|---|---|---|
| Low / Medium | Tiny, Express, Standard outside Deep domains | plan → implement → PR (non-draft) after the plan is approved |
| High | any Deep domain (auth, `database-sync`, `reports`, accounts, migrations, deploy scripts) | plan approval required; exact PR + SHA approval before any release |
| Very High | destructive migration, irreversible production action, access-control change with uncertain rollback | exact plan-version approval before code; exact PR + SHA approval before release |

Approval commands, accepted only from Romeo in the owning session:

```text
APPROVE PLAN <issue-id> v<n>
APPROVE RELEASE <pr-number> <commit-sha>
REJECT <issue-id> <reason>
```

## Activation

Low/Medium autonomous release activates only after one real pilot task has gone plan → PR under this contract with clean evidence, and Romeo then sends exactly:

```text
ACTIVATE LOW/MEDIUM AUTONOMOUS RELEASE
```

Record the activation (date, approver, pilot PR) in `.ai-engineering/config/autonomous-engineering.yaml`. Even when active, "release" means merging the PR; deployment stays Romeo's manual `update-monorepo.bat` run. High and Very High gates never relax.

## Conflict and repair policy

- Resolve only mechanical conflicts (imports, formatting, non-behavioural docs, regenerated files). Behaviour, auth, access-control, migration or contract conflicts stop for a decision (`CONFLICT_REVIEW`), reporting both intents, the files, and the options.
- Each failing gate gets at most three evidence-changing fix-and-retest cycles; repeating the same action is forbidden. The fourth failure stops as `BLOCKED_HUMAN` with the attempts and the recommended next step.
