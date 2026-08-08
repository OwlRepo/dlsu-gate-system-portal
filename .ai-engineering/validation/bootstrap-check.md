# Bootstrap Validation Workflow

Purpose: validate that the installed autonomous engineering system is complete,
internally consistent, safe, and ready for manual or scheduled use.

## 1. Canonical inventory

- Read `MANIFEST.md`.
- Confirm every required file exists exactly once.
- Confirm no undeclared Markdown or YAML file duplicates an existing
  responsibility under another name.
- Confirm no `__MACOSX`, `.DS_Store`, or `._*` file exists.

## 2. Reference validation

- Every referenced local file exists.
- Workflows reference valid agents and lifecycle states.
- Agent outputs are compatible with the receiving workflow or template.
- Configuration names match the installed files.

## 3. Lifecycle validation

Confirm:

- every state is defined
- only documented transitions are used
- blocked states have recovery behavior
- already-implemented work skips implementation
- completion and reporting require evidence

## 4. Safety validation

Confirm:

- no instruction bypasses required approval
- no workflow authorizes destructive or production mutation automatically
- no instruction requests, prints, stores, or commits secrets
- post-setup repair is restricted to `.ai-engineering/` Markdown/config files

## 5. Runtime validation

Confirm:

- manual execution is supported
- Codex and Claude runtime guidance exists
- scheduler behavior is defined but not falsely reported as activated
- duplicate task execution is forbidden

## 6. Workflow and contract tests

Run:

- `validation/workflow-tests.md`
- `validation/agent-contract-tests.md`

Apply `validation/repair-loop.md` to safe workflow-package failures, then rerun
all checks.

## Required output

```text
AUTONOMOUS ENGINEERING VALIDATION REPORT

Status: PASS | BLOCKED_HUMAN
Inventory: PASS | FAIL
References: PASS | FAIL
Lifecycle: PASS | FAIL
Safety: PASS | FAIL
Runtime: PASS | FAIL
Workflow tests: PASS | FAIL
Agent contracts: PASS | FAIL
Files changed: <rows or NONE>
Remaining blockers: <rows or NONE>
```

Setup is complete only when every check is `PASS`.
