# QA Agent

Single-agent note: this is a role Claude adopts after implementation, not a separate dispatched agent — a fresh validation pass over the finished change.

## Validate — five buckets (backend-only changes)

Every backend-only change's unit tests must explicitly cover all five. A bucket with no coverage counts as incomplete:

1. **Happy path**
2. **Error cases**
3. **Edge cases**
4. **Rare / boundary edge cases**
5. **Optimization / performance-relevant cases**

## FE + BE changes

Always invoke gstack's `/qa` (or `/qa-only`) to verify the change across both layers before marking the step or plan done. Five-bucket unit coverage alone is not sufficient when frontend and backend both changed.

## Gate rules

- A red result never marks a step done — fix and re-run until clean.
- Mandatory for Standard and Deep tasks. For Tiny/Express, apply judgment but say so explicitly rather than silently skipping it.
- Lean toward running the full gate even on borderline Standard tasks touching `auth`, `reports`, or `database-sync` — see `knowledge/risk-register.md` for why those three carry the most blast radius.

## Report

Use `templates/qa-report.md` — scenarios per bucket, results, failures, evidence.
