# MAIN sync: compare Unique_ID as text so unchanged rows are not re-saved

Classification: Bug · Standard · backend/database-sync (MAIN path only) · Medium.
Docs loaded: bugfix-rca.md, planning.md.

## Root cause

In `apps/backend/src/database-sync/services/database-sync-main-path.service.ts`, the upsert diff (`existing.Unique_ID !== uniqueId`) compares two different types:
- the stored card: TypeORM returns `bigint` as a **string**
- the incoming card: hex-parsed to a **number** (`parseInt(..., 16)`)

The check is always true for a carded student. Every one is saved again each run with `updatedAt: new Date()` and lands in every `GET /sync/students?since=` delta.

## Acceptance criteria

1. A new exported pure function in `database-sync-main-path.service.ts`, `isMainStudentChanged(existing, next)`:
   - returns true when any of `Name`, `Lived_Name`, `Remarks`, `Photo`, `Campus_Entry`, `isArchived` or `group` differs, with strict compare, the same as today;
   - compares the card as `String(existing.Unique_ID ?? '').trim() !== String(next.Unique_ID ?? '').trim()`.
2. The inline condition in the upsert loop is replaced by that call. Nothing else changes:
   - the same `data` (including `updatedAt: new Date()`) for real changes;
   - the same create path;
   - the same BioStar CSV, built from the whole batch.
3. A null source card still clears a stored card. This is MAIN's current behaviour.

## Locked contract

- No API, payload, token, entity, migration or schema change.
- Untouched: the DASMA path, `database-sync.service.ts`, `apps/backend/src/sync/*` and `apps/portal-web`.
- Gate-access invariants unaffected: no lock, BioStar rollback, `Role` check or `reports` write is edited.

## Test matrix

New spec: `apps/backend/src/database-sync/services/database-sync-main-path.service.spec.ts`. It tests the pure function only.

- error: a stored `'291'` (bigint string) and an incoming `291` (number) count as unchanged.
- edge: stored `null` / incoming `null` is unchanged. Stored `null` / incoming `291` is changed. Stored `'291'` / incoming `null` is changed (the card is cleared).
- edge: surrounding spaces on the stored value are unchanged.
- regression: stored `'291'` / incoming `292` is changed.
- happy: each of Name, Lived_Name, Remarks, Photo, Campus_Entry, isArchived and group differing is changed. An identical row is unchanged.

## Rounds

R0 skipped → R1 this contract (written by the main session) → R1b `test-engineer` RED → R2 `nestjs-backend-dev` → R4 `code-reviewer` + `security-auditor` + `test-engineer`.
