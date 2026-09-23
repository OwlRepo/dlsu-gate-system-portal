# Handoff and Integration

> Purpose: everything between "code validated" and "task done" — rebase, gate, push, PR, docs sync, final report.
> Load rule: read at flow node W, before declaring any task done. The Completion Gate below is mandatory.

## Integration sequence (this is THE list)

1. Confirm the current worktree and branch match the task and the diff has no unrelated changes.
2. Commit all validated changes with focused messages (`<type>(<scope>): <description>`).
3. `git fetch origin`, then reconcile with `origin/main`: rebase a branch that has not been pushed or reviewed yet; once a PR is open, merge `origin/main` into the branch instead of rewriting its history.
4. Resolve conflicts using both tasks' intent — never blindly ours/theirs. If a conflict forces a choice between product behaviours, stop and request a decision.
5. Re-run all required validation after the rebase/merge; review the resulting diff.
6. Run `npm run tdd:gate` (base `origin/main`) with the PR body you will use (`--pr-body-file <path>`), and keep its output for the PR. There is no CI: this local run is the only TDD gate a PR gets.
7. Push: first push `git push --set-upstream origin <branch>`; after a rebase of an already-pushed branch, `git push --force-with-lease origin <branch>` only.
8. Do NOT create, approve, merge or close a pull request unless explicitly instructed. Never merge into `main` yourself; never delete the branch or worktree automatically. All PR paths read `docs/ai/pr-evidence.md` first — a PR without the evidence its Change Type requires stays a draft.
9. After one task merges, dependent/overlapping branches merge the new `origin/main` before any later merge.

## Release flow (single branch → main)

This repo has only `main` (verified: `git branch -a`; PRs #1 and #2 merged into `main` with merge commits).

1. One task branch → one PR into `main`, merged with **"Create a merge commit"**.
2. `main` is not protected (GitHub API: "Branch not protected") and there is no CI, so nothing stops a red PR. The pasted `tdd:gate` and validation output in the PR body is the gate; the reviewer checks it.
3. Deploy is manual and belongs to Romeo: on the Windows Server 2022 host, `deployment_docs_ws2022_prod/update-monorepo.bat` pulls `origin/main`, then `deploy-monorepo.bat` installs, checks env and DB, backs up the DB, runs pending migrations, builds, and reinstalls the NSSM service. Agents never deploy.
4. Before claiming anything about production, check it against `origin/main`, never a local branch.

## Docs and learning sync (same change, mandatory)

- Update `docs/ai/file-index/repository-map.md` for every touched source file, plus the matching map (`architecture-manifest`, `module-ownership-map`, `contracts/*`, `risk-register`, `testing-strategy`, `dev-environment`). Scope it to what changed — never a blanket re-index.
- Genuinely new patterns or decisions: `.ai-engineering/memory/lessons-learned.md` or `.ai-engineering/memory/architecture-decisions.md`.
- Persona changes: edit `agents/src/`, run `npm run agents:generate`, commit the generated `.claude/agents/` files with the source.

## Completion Gate

A task is not complete unless ALL are true:

- Changes committed on the task branch; branch reconciled with `origin/main`; validation re-run green afterwards; branch pushed.
- `npm run tdd:gate` passed on the final head, and its output (plus any waiver lines) is in the PR body or the final report.
- Exact branch and latest commit SHA reported; manual-test instructions given, or evidence states why manual testing is not required.
- No PR created or merged without explicit instruction.
- Docs sync done (section above).
- `/graphify . --update` ran after the final indexed edit; its graph diff and token evidence were reviewed.
- If a PR exists: its state and any checks are verified with `gh pr view <number>` — never assumed.

## Required final report

- Task ID · implemented behaviour · files changed/created.
- Compatibility: behaviour preserved, public-contract impact, migration impact.
- Validation: each command run and its result. Never claim a gate passed if it was not run.
- TDD gate output and waivers.
- Graphify evidence: command/mode, changed-file count, graph diff, semantic tokens (actual, or a labelled bounded estimate + method).
- Review findings: resolved and remaining risks.
- Git state: worktree path, local branch, remote branch, target base, latest commit SHA, commits created.
- Manual test scenarios + how to switch to the branch, or `NOT REQUIRED` with evidence.

End with this exact status block:

```text
Ready for manual testing: YES/NO/NOT REQUIRED
Ready for PR creation: YES/NO
PR created: YES/NO
Merged: YES/NO
Production verified: YES/NO/NOT APPLICABLE
```
