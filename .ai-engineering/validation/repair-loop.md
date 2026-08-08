# Bootstrap Repair Loop

Run this loop only after `.ai-engineering/` has been installed.

When validation fails:

1. Identify the exact failed check.
2. Identify the affected file inside `.ai-engineering/`.
3. Explain why the inconsistency exists.
4. Apply the smallest correction that restores the documented contract.
5. Modify only Markdown or configuration files inside `.ai-engineering/`.
6. Do not modify application code, dependencies, database files, infrastructure,
   deployment configuration, secrets, external systems, schedules, or messages.
7. Do not delete or weaken a validation check merely to make it pass.
8. Re-run the complete validation suite.

Repeat until:

- `PASS`, or
- `BLOCKED_HUMAN`

Use `BLOCKED_HUMAN` when:

- safety rules conflict
- existing repository instructions conflict at equal authority
- a business or product decision is required
- a security boundary is unclear
- repair would require changing application code or an external system
- a major operating-model change is required

The final report must list every changed file, reason, validation result, and any
remaining human action.
