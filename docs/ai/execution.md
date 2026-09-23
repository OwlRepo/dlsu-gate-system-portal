# Execution Rules

> Purpose: every rule that governs IMPLEMENTING an approved plan — worktree, code, tests, review, QA.
> Load rule: read at flow node S, before creating the worktree or writing any code.
> Source of truth: real code and `package.json` scripts beat this map.

## Worktree and branch isolation

Planning, investigation and review-only sessions need no worktree. Any session that modifies files requires one dedicated task branch and worktree:

1. `git fetch origin` first, then create a NEW worktree and branch from the fetched `origin/main` with `scripts/new-task-worktree.sh <type> <short-name>`. It creates `.claude/worktrees/<type>-<short-name>` on branch `<type>/no-ticket-<short-name>` (untracked, so the first push sets the upstream) and links the primary checkout's `node_modules`.
2. Branch types: `fix|feat|enhancement|refactor|perf|infra|chore|docs`. Rename the branch to carry a Linear ID when there is one (`git branch -m <type>/<ID>-<short-name>`).
3. Never modify the primary checkout. Never commit on `main` (the pre-commit hook in `scripts/git-hooks/` blocks it once `bun install` has run the `prepare` script). Never reuse another task's worktree. One branch + worktree per logical task. Never delete a worktree automatically.
4. Never run `bun install` inside a worktree: `node_modules` is a link to the primary checkout and an install writes through it. Dependency changes are planned and approved first.
5. If safe worktree creation is unavailable, stop before modifying anything and report the exact command required.

## Single-task rule

Implement ONLY the selected task; other tasks in a batch plan are read-only context. No speculative code, no touching files "because a later task may need them". Follow the approved plan unless repository evidence proves it invalid — then stop and report the contradicted assumption, the evidence, and the required correction.

## Implementation rules

1. One logical change at a time; minimal diff; no unrelated cleanup; no speculative abstractions.
2. Preserve existing naming and module conventions (`CLAUDE.md` "Conventions").
3. Never weaken or remove tests to make them pass. Fix type/lint/runtime errors; never suppress them.
4. No breaking API/schema/behaviour changes without approval. No dependency or lockfile changes unless the plan approved them. No destructive DB operations without Romeo's explicit approval.
5. The four gate-access invariants (`.ai-engineering/core/safety.md`) hold at every commit, not only at the end.
6. After each validated logical unit, create a focused commit: `<type>(<scope>): <concise description>`.

## Testing requirements (Strict TDD)

Full rule: `docs/ai/testing-strategy.md` "Strict TDD".

- RED first, always: write every test in the plan's Test Matrix (cases `error:` > `edge:` > `regression:` > `happy:`), run `npm run tdd:red`, see it fail, and commit the tests alone as `test(<scope>): ...` BEFORE touching `apps/*/src` logic. The Claude hook blocks guarded edits until then.
- Runners: Jest in `apps/backend` (`TZ=Asia/Manila npx jest <spec>`), Vitest in `apps/portal-web` (`npx vitest run <test>`), node:test for `scripts/` (`npm run test:scripts`).
- Coverage: happy path, error cases, loading states (portal), edge cases; backend changes also cover rare/boundary and performance-relevant cases (`.ai-engineering/agents/qa.md` five buckets).
- Bugs found during testing are fixed in the same task, never deferred.
- Mock the SQL Server source and BioStar in unit tests; the `database-sync` e2e uses a local PostgreSQL and the fake BioStar server (`apps/backend/test/fake-biostar-server.ts`). Never point a test at a shared or production database.

## Mandatory Graphify closeout

After the final change to any indexed source or document, load the `graphify` skill and run `/graphify . --update` from the repo root before review, commit and handoff. Re-run after a later indexed edit or a rebase that changes indexed files. Rules and token controls: `docs/ai/planning.md` "Mandatory Graphify phase".

## Review mode

Review runs separately from implementation: a fresh pass that takes only the diff as input (the `code-reviewer` persona, `ecc:code-review`, or gstack `/review`). Inspect `git diff origin/main...HEAD`, not just final file state. Check: acceptance criteria, root-cause correctness, the four invariants, scope creep, hidden regressions, breaking changes, duplicate logic, dead code, security (`security-auditor` for auth/sync/accounts/uploads), missing/weak tests, error handling. Never approve solely because tests pass.

## QA mode

`/qa` (test-and-fix) or `/qa-only` (report) for changes that touch both apps; the five-bucket sweep for backend-only changes (`.ai-engineering/agents/qa.md`). The standard command set, stated once:

- `cd apps/backend && npx tsc --noEmit && npx eslint . && TZ=Asia/Manila npx jest`
- `cd apps/portal-web && bun run check-types && bun run lint && npx vitest run`
- `npm run test:scripts` and `npm run agents:lint` when `scripts/` or personas changed
- `bun run build:backend` / `bun run build:web` when the change can affect the build
- `TZ=Asia/Manila bun run test:e2e` (in `apps/backend`) when `database-sync` behaviour changed and a local PostgreSQL is available

Report each command and its result. Never claim validation that was not executed. Then proceed to `docs/ai/handoff.md`.
