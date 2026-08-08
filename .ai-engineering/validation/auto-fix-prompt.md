# Validation Auto-Fix Prompt

Run the complete autonomous engineering validation suite after setup.

Before validating:

1. Read `MANIFEST.md`.
2. Confirm the installed `.ai-engineering/` inventory matches the manifest.
3. Confirm no duplicate rule or workflow exists under an alternate filename.

If problems are found:

1. Do not ignore failures.
2. Do not remove or weaken checks.
3. Do not weaken safety or approval rules.
4. Fix only Markdown or configuration files inside `.ai-engineering/`.
5. Do not modify application code, dependencies, database files, infrastructure,
   deployment configuration, secrets, external systems, schedules, or messages.
6. Explain every change.
7. Re-run the entire validation suite after repairs.

Stop with `BLOCKED_HUMAN` when a safe repair requires a product decision,
security decision, conflict resolution, application-code change, or external
system mutation.

Return:

- status: `PASS` or `BLOCKED_HUMAN`
- checks run
- files changed
- issues fixed
- unresolved items
- evidence
