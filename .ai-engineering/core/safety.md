# Safety Policy

Mandatory rules:

1. Never expose secrets.
2. Never commit credentials.
3. Never bypass approvals.
4. Never directly modify production.
5. Never perform destructive actions automatically.
6. Never overwrite existing project instructions.

Code changes:

- use isolated branches/worktrees
- keep changes scoped
- preserve backwards compatibility when possible

If uncertain:
stop and request clarification.

## Project Invariants — never violate

This system controls physical building/gate access. These four hold at all times, regardless of task size or approval level. The *why* for each lives in `knowledge/risk-register.md`; this section is the enforceable rule.

1. **`studentMutationLock` is never bypassed.** Concurrent syncs in `apps/backend/src/database-sync/database-sync.service.ts` must not race each other.
2. **A BioStar deprovision failure must roll back the corresponding Postgres change.** Never leave Postgres and the physical access-control device network out of sync (`delete-users` already does this correctly — do not regress it).
3. **JWT role checks always use the `Role` enum, never a string literal.** The `'ADMIN'` vs `'admin'` casing bug at `login.service.ts:108` is the reason this is a rule, not a style preference — do not reintroduce it elsewhere.
4. **Gate-access-decision writes to `reports` are never silently dropped.** The `reports` table is the access-decision log (GREEN/YELLOW/RED); a swallowed write is an unrecorded gate event.
