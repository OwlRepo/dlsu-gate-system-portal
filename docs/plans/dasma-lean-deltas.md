# DASMA bookkeeping-only writes keep `updatedAt`

Classification: Enhancement · Standard · backend/database-sync (DASMA path only) · Medium.
Docs loaded: planning.md, bugfix-rca.md.

## Why

`GET /sync/students?since=<syncToken>` returns every student whose `COALESCE(updatedAt, createdAt)` moved (`apps/backend/src/sync/sync.service.ts:35`). TypeORM's `update()` stamps `updatedAt` unless the patch sets it. Several DASMA writes touch only columns mobile never receives as a change signal (`remarks_checked_at`, `remarks_clear_pending`, `biostar_row_hash`). They still move `updatedAt`, so up to 500 unchanged students a run land in every phone's delta.

## Acceptance criteria

All in `apps/backend/src/database-sync/services/database-sync-dasma-path.service.ts`:

1. The bookkeeping-only `studentRepository.update()` calls pass `updatedAt: () => '"updatedAt"'`, so `updatedAt` is left as it was. The calls are at `:875`, `:907` and `:918` (remark sweep), `:1089` (`persistRowHashes`, BioStar row hash) and `:2677` (clear confirmed).
2. The detail-pull update (`:585`, payload built at `:563-583`):
   - It sets `updatedAt: new Date()` only when `photoChanged || uniqueIdChanged || nameChanged || isArchivedChanged`. Otherwise it keeps `updatedAt`.
   - `remarks_checked_at` and `remarks_clear_pending` are still written as today.
3. The real-change writes at `:2139`, `:2191`, `:2457` and `:2700` are unchanged.
4. Every write that happened before still happens. Only the `updatedAt` value differs.

## Locked contract

- `GET /sync/students` stays exactly as it is: payload fields, `nextCursor`, `syncToken`, token format, paging and the 10-minute overlap.
- No entity, migration, schema, trigger or index change.
- Untouched: `database-sync-main-path.service.ts`, `database-sync.service.ts`, `apps/backend/src/sync/*`, `student.entity.ts`, `migrations/*` and `apps/portal-web`. MAIN campuses behave the same as before.
- The four gate-access invariants are unaffected. No `studentMutationLock`, BioStar rollback, `Role` check or `reports` write is edited.
- The students CSV export column `updatedAt` (`students.service.ts:164`) now means "last real change".

## Test matrix

Spec: `apps/backend/src/database-sync/services/database-sync-dasma-path.service.spec.ts`. Run with `TZ=Asia/Manila`.

- error: the `persistRowHashes` update throws (catch at `:1098`). `updatedAt` is unchanged and the row is re-exported next run.
- edge: a detail pull entered only through `!remarks_checked_at` leaves `updatedAt` unchanged.
- edge: a detail pull entered only through `remarkNeedsClearing` leaves `updatedAt` unchanged.
- edge: a detail pull with a Photo change bumps `updatedAt`.
- edge: a detail pull with a Name change bumps `updatedAt`.
- regression: a remark-sweep run leaves every swept student's `updatedAt` unchanged.
- regression: a BioStar export plus hash stamp leaves `updatedAt` at the value the real change set.
- regression: a confirmed remark clear (`:2677`) leaves `updatedAt` unchanged.
- happy: a source Name/Remarks/isArchived change still bumps `updatedAt`.

Fixture: the fake repo `update()` (spec `:170`) models TypeORM:
- If the patch sets `updatedAt` to a function, keep the row's current value.
- If the patch sets `updatedAt` to a Date, use that Date.
- If the patch does not set it, stamp `new Date()`. `setClock` controls that date through `jest.setSystemTime`.
- No existing assertion changes.

## Rounds

R0 skipped (no schema) → R1 this contract → R1b `test-engineer` alone (RED + fixture) → R2 `nestjs-backend-dev` alone → R3 main session verifies → R4 `code-reviewer` + `security-auditor` + `test-engineer`.

## Risk

A future DASMA write that only touches bookkeeping columns must also keep `updatedAt`, or deltas grow again. The regression tests cover only the sites above.
