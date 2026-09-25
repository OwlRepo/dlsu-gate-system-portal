## RCA — remark clear for a user BioStar does not hold "fails" on every sync

Stage: **RCA only (flow node D).** No code. The implementation plan (`docs/ai/prompts/bugfix-plan.md` +
`planning.md` + `plan-template.md`) is written only after this RCA is approved (node E).

```
Task Classification:
- Intent: Bug
- Workflow: bugfix (RCA → plan → TDD)
- Task Size: Standard
- Domain: database-sync (Dasma path) / BioStar integration
- Risk: Low (no gate-access effect; false failure + endless retry)
- Contract Areas: BioStar GET /api/users/{id} error shape
- Next Action: approve RCA → write plan
```

**TL;DR.** Like a courier told to remove a sticker from a parcel that was never shipped: he
knocks, hears "no such parcel here", writes "failed", and comes back every night forever.
Cayle removed the remark on archived student `91000006`. Archived students are never sent to
BioStar, so BioStar has no such user. The sync asks BioStar to clear the remark, gets
"User can not be found", records a failure, and retries on every run.

1. **Issue Selected** — Cayle's 2026-09-25 07:00 scheduled sync diagnostics
   (`diag_sync-1_2026-09-24T23-05-10-374Z.json`): `remarks.attempted 1, succeeded 0,
   failedIds ["91000006"], pendingCarriedOver ["91000006"]`.
2. **Bug Summary** — Observed: the remark clear for `91000006` is reported failed and retried
   each run. Expected: nothing to clear (the user is not in BioStar), so count it as done and
   drop the pending flag.
3. **Reproduction Flow From Code**
   - Remark removed in SQL → `D` push sets `remarks_clear_pending: true` in the same write that
     nulls `Remarks` (`database-sync-dasma-path.service.ts:2042`), for archived rows too.
   - Each push loads `where: { remarks_clear_pending: true }` (`:2607`), re-validates
     `stillEmpty`, and calls `clearRemovedRemarksInBiostar` (`:2638`).
   - `BiostarApiService.clearUserCustomField` (`biostar-api.service.ts:55`) first GETs
     `/api/users/{id}`; the `catch` (`:140–148`) turns every error into `false`.
   - `false` → `failed` (`:2976`) → the flag is not cleared (`:2645–2650`, only `succeeded`
     and `staleFlags` are reset) → retried next run, forever.
4. **Backend Investigation** — Live read-only GET against the sandbox, 2026-09-25:
   `GET /api/users/91000006` → HTTP 400,
   `{"Response":{"code":"201","message":"User can not be found with id"}}`.
   Local PostgreSQL: `91000006` `isArchived = true`, `Campus_Entry = 'N'`, `Remarks` empty.
   Archived rows are skipped from the CSV (`archivedSkippedFromCsv: 401` in the same diag).
5. **Frontend** — not applicable.
6. **Contract check** — not applicable (backend-only).
7. **Gate-access invariants** — none touched. A user absent from BioStar has no remark and no
   access there; `studentMutationLock`, deprovision rollback, roles and `reports` are not on
   this path.
8. **Root Cause** — `clearUserCustomField` treats BioStar's definitive "user not found"
   (HTTP 400 + `Response.code "201"`) as a failed clear, although the desired end state (no
   remark in BioStar) already holds. Evidence for: the live GET above and the diag
   `failedIds ["91000006"]`. Would be disproved by: `91000006` existing in BioStar, or the
   clear failing on the PUT rather than the GET; the GET already returns 400.
9. **Why existing code allows it** — the function already returns `true` for "field absent or
   blank" (`:95–103`) but has no branch for "user absent". The same codebase already treats a
   BioStar 400/404 on this endpoint as a definitive "no such user" in `fetchBiostarUserDetail`
   (`biostar-api.service.ts:290`); the clear path never adopted it.
10. **Eliminated causes** — SQL lockout (the push ran, `seenFromSource 20054`); BioStar
    slowness (the 400 is an immediate answer, not a timeout); a stale pending flag (the
    `stillEmpty` re-check passed, and the row really has no remark); our 2026-09-23/24
    releases (they did not touch `clearUserCustomField` or the pending-flag logic).
11. **Remaining uncertainties** — none that block the fix. Whether other archived users with
    removed remarks exist on the test server is unknown; the fix covers them the same way.
12. **Confidence** — High: reproduced live, and the code path is fully traced.
13. **Solution direction** — in `clearUserCustomField`, treat the GET's "user not found"
    (HTTP 404, or HTTP 400 with `Response.code "201"`, as measured live) as done → `true`, so
    the pending flag is cleared. Every other error stays `false` and is retried. Log nothing
    for it: it is an ordinary answer, like the detail-fetch rule.
14. **Planning handoff**
    - Owning layer: `apps/backend/src/database-sync/services/shared/biostar-api.service.ts`
      (`clearUserCustomField`).
    - Tests: `biostar-api.service.spec.ts` — `regression:` a 400 with code 201 on the GET
      returns `true` and makes no PUT; `edge:` a 404 returns `true`; `error:` any other 400 or a
      500 still returns `false`. Plus a `database-sync-dasma-path.service.spec.ts` regression
      that the pending flag is cleared for such a user.
    - Ruled out: the pending-flag logic and the sweep need no change.

RCA approved by Romeo on 2026-09-25 (node E).

---

## Plan — count "user not found in BioStar" as a finished remark clear

**TL;DR.** The courier from the RCA should mark "no such parcel" as done, not failed. One
branch in `clearUserCustomField`: when BioStar says the user does not exist, return `true`.

### Task metadata

- Classification: `BUG` · Standard · database-sync (Dasma path) / BioStar · Low.
- Docs loaded: `planning.md, plan-template.md` (+ `prompts/bugfix-plan.md`, `prompts/bugfix-rca.md`, `task-router.md`, `execution.md`).
- Root cause: see the RCA above, §8.
- Claims reversed: the RCA handoff proposed a `PS` regression test. Dropped, because `PS` mocks
  `BiostarApiService` wholesale, so no `PS` test can fail on this bug. The `BS` tests below
  exercise the real method.
- Gate-access invariants: none touched (RCA §7).
- Detected running model: Claude Opus 5.5. Recommended: `opus`, high, every phase; fallback
  `sonnet`, high.
- Branch: `fix/no-ticket-biostar-remark-clear-missing-user`, from `origin/main` (`e00fc4f`).
- Release path: one branch → merge → push `main` (Romeo's standing direction on 2026-09-24:
  "once passed you can directly push it to main branch").
- Persona rounds: `project-manager` confirms; `test-engineer` (RED); `nestjs-backend-dev`
  (GREEN); `code-reviewer` + `security-auditor`. No `database-architect`.
- Graphify: skipped by Romeo's standing instruction.
- Preflight: `git fetch origin && sh scripts/new-task-worktree.sh fix biostar-remark-clear-missing-user`,
  then link `apps/backend/logs` to the primary checkout's.

Paths: `B` = `apps/backend/src/database-sync/services/shared/biostar-api.service.ts`,
`BS` = `apps/backend/src/database-sync/services/shared/biostar-api.service.spec.ts`.

### Phase 1 — RED (`opus`, high)

In `BS`, Old:

```ts
  it('returns false when user_custom_fields is not an array', async () => {
```

New:

```ts
  // What BioStar sends for an HTTP error, as axios hands it over.
  const httpFailure = (status: number, code?: string) => {
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn(() => true);
    return Object.assign(new Error(`Request failed with status code ${status}`), {
      isAxiosError: true,
      response: {
        status,
        data: code === undefined ? {} : { Response: { code } },
      },
    });
  };

  it('error: still fails on a 400 that is not "user not found"', async () => {
    (axios.get as jest.Mock).mockRejectedValue(httpFailure(400, '1'));

    await expect(clear()).resolves.toBe(false);
  });

  it('error: still fails when BioStar answers 500', async () => {
    (axios.get as jest.Mock).mockRejectedValue(httpFailure(500));

    await expect(clear()).resolves.toBe(false);
  });

  it('edge: counts a 404 for the user as nothing left to clear', async () => {
    (axios.get as jest.Mock).mockRejectedValue(httpFailure(404));

    await expect(clear()).resolves.toBe(true);
    expect(axios.put).not.toHaveBeenCalled();
  });

  // Measured 2026-09-25: archived student 91000006 is never sent to BioStar,
  // so GET answers 400 with Response.code "201" ("User can not be found with
  // id"), and the clear was retried as a failure on every sync.
  it('regression: counts "user not found" (400, code 201) as nothing left to clear', async () => {
    (axios.get as jest.Mock).mockRejectedValue(httpFailure(400, '201'));

    await expect(clear()).resolves.toBe(true);
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('returns false when user_custom_fields is not an array', async () => {
```

**E2E: simulate the exact live problem over real HTTP.** Romeo asked on 2026-09-25 for the
exact problem plus the error cases, edge cases and happy path.

`FB` = `apps/backend/test/fake-biostar-server.ts`. Old:

```ts
  /** HTTP status for PUT. Default 200. */
  putStatus?: number;
}
```

New:

```ts
  /** HTTP status for PUT. Default 200. */
  putStatus?: number;
  /**
   * What GET /api/users/:id answers for a user not in `userDetails`. Default
   * 404. The live sandbox answers 400 with Response.code "201" (2026-09-25).
   */
  missingUserAnswer?: { status: number; code: string };
}
```

Old:

```ts
        if (!detail) {
          this.json(res, 404, { Response: { code: '404' } });
          return;
        }
```

New:

```ts
        if (!detail) {
          const answer = this.scenario.missingUserAnswer ?? {
            status: 404,
            code: '404',
          };
          this.json(res, answer.status, { Response: { code: answer.code } });
          return;
        }
```

`E2E` = `apps/backend/test/dasma-sync-biostar.e2e-spec.ts`. Old:

```ts
  // ==================================================================
  // Failure over real HTTP
```

New:

```ts
  // ==================================================================
  // Clearing a remark for a user BioStar does not hold
  // ==================================================================
  // Live 2026-09-25: archived 91000006 had its remark removed; BioStar never
  // held the user, answered GET with 400 / code 201, and the clear was
  // retried as a failure on every sync.
  describe('remark clear for a user BioStar does not hold', () => {
    const removeRemarkFromArchived = async () => {
      sourceRows = [sourceRow({ IsArchived: true, Remarks: 'Owes fee' })];
      await service.executeDatabaseSync('e2e-1');
      sourceRows = [sourceRow({ IsArchived: true, Remarks: null })];
      await service.executeDatabaseSync('e2e-2');
    };

    it('error: keeps the clear pending when BioStar fails to answer (500)', async () => {
      biostar.scenario.missingUserAnswer = { status: 500, code: '500' };

      await removeRemarkFromArchived();

      expect((await byId('12100001')).remarks_clear_pending).toBe(true);
      expect(biostar.userPuts).toHaveLength(0);
    }, 120000);

    it('error: keeps the clear pending on a 400 that is not "user not found"', async () => {
      biostar.scenario.missingUserAnswer = { status: 400, code: '1' };

      await removeRemarkFromArchived();

      expect((await byId('12100001')).remarks_clear_pending).toBe(true);
    }, 120000);

    it('edge: a 404 for the user finishes the clear without a PUT', async () => {
      biostar.scenario.missingUserAnswer = { status: 404, code: '404' };

      await removeRemarkFromArchived();

      expect((await byId('12100001')).remarks_clear_pending).toBe(false);
      expect(biostar.userPuts).toHaveLength(0);
    }, 120000);

    it('edge: a clear kept pending by an outage finishes once BioStar answers "not found"', async () => {
      biostar.scenario.missingUserAnswer = { status: 500, code: '500' };
      await removeRemarkFromArchived();
      expect((await byId('12100001')).remarks_clear_pending).toBe(true);

      biostar.scenario.missingUserAnswer = { status: 400, code: '201' };
      await service.executeDatabaseSync('e2e-3');

      expect((await byId('12100001')).remarks_clear_pending).toBe(false);
    }, 150000);

    it('regression: an archived student BioStar never held stops retrying after one sync', async () => {
      biostar.scenario.missingUserAnswer = { status: 400, code: '201' };

      await removeRemarkFromArchived();

      const stored = await byId('12100001');
      expect(stored.Remarks).toBeNull();
      expect(stored.remarks_clear_pending).toBe(false);
      expect(biostar.userPuts).toHaveLength(0);
    }, 120000);

    it('happy: a student BioStar holds still gets the remark cleared by PUT', async () => {
      biostar.scenario.missingUserAnswer = { status: 400, code: '201' };
      sourceRows = [sourceRow({ Remarks: 'Owes fee' })];
      await service.executeDatabaseSync('e2e-1');
      biostar.userDetails['12100001'] = {
        user_id: '12100001',
        user_custom_fields: [
          { custom_field: { name: 'Remarks' }, item: 'Owes fee' },
        ],
      };
      sourceRows = [sourceRow({ Remarks: null })];
      await service.executeDatabaseSync('e2e-2');

      expect(biostar.userPuts).toHaveLength(1);
      expect((await byId('12100001')).remarks_clear_pending).toBe(false);
    }, 120000);
  });

  // ==================================================================
  // Failure over real HTTP
```

Run `npm run tdd:red`, then
`cd apps/backend && TZ=Asia/Manila npx jest --config ./test/jest-e2e.json -t "BioStar does not hold"`.
Must fail:
- `BS`: `edge: counts a 404…` and `regression: counts "user not found"…`;
- `E2E`: `edge: a 404…`, `edge: a clear kept pending…`, `regression: an archived student…`.

May pass, because they pin current behaviour: both `BS` `error:` tests, both `E2E` `error:` tests,
and `E2E` `happy:`. Any other failure: stop and report. Commit `BS`, `FB` and `E2E` only:
`test(dasma): RED for a remark clear on a user BioStar does not hold`.

### Phase 2 — GREEN (`opus`, high)

In `B`, Old:

```ts
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : ((error as Error)?.message ?? String(error));
      this.logger.warn(
        `[Biostar] Failed to clear ${fieldName} for user ${userId}: ${message}`,
      );
      return false;
    }
```

New:

```ts
    } catch (error) {
      // No such user, no remark: the clear's end state already holds, and
      // retrying could never succeed. Measured 2026-09-25: an archived
      // student is never sent to BioStar, and GET answers 400 with
      // Response.code "201" ("User can not be found with id").
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const code = String(error.response?.data?.Response?.code ?? '');
        if (status === 404 || (status === 400 && code === '201')) {
          return true;
        }
      }
      const message = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : ((error as Error)?.message ?? String(error));
      this.logger.warn(
        `[Biostar] Failed to clear ${fieldName} for user ${userId}: ${message}`,
      );
      return false;
    }
```

`npx prettier --write` on `B` and `BS`. Commit:
`fix(dasma): count a remark clear on a user BioStar does not hold as done`.

### Phase 3 — Validation and live check (`opus`, high)

```bash
cd apps/backend && npx tsc --noEmit && npx eslint src/database-sync test && TZ=Asia/Manila npx jest && TZ=Asia/Manila npx jest --config ./test/jest-e2e.json
```

Expected: unit 327 + 4 = **331**, e2e 49 + 6 = **55**, all passing. Then
`bun run build:backend && npm run tdd:gate`, then `code-reviewer` + `security-auditor`.

Live check: merge to local `main`, run the backend, set `remarks_clear_pending = true` on
`91000006` in local PostgreSQL only (its `Remarks` is already empty; this is the server's
state), and trigger one Sync. It passes if the diag shows `remarks.succeeded` including
`91000006`, `failedIds` empty, and the flag reset to `false`. Then push `main`.

### Validation and acceptance

| Layer | Required | File | Cases |
|---|---|---|---|
| Unit | yes | `BS` | error: other 400 fails · error: 500 fails · edge: 404 done · regression: 400 + code 201 done |
| e2e (real HTTP, fake BioStar) | yes | `E2E` + `FB` | error: 500 keeps pending · error: other 400 keeps pending · edge: 404 done, no PUT · edge: outage then "not found" finishes · regression: archived student, 400/201, done after one sync · happy: held user still cleared by PUT |
| migration / portal | not required | — | no schema or UI change |

Five buckets: happy (the existing clear tests, unchanged); error (400 other, 500); edge (404);
rare (400 with code 201); performance (no PUT for a missing user).

| Regression risk | Proof |
|---|---|
| A real failure is counted as done, leaving a stale remark | the `error:` tests (other 400, 500) still return `false` |
| The existing "cannot be read" test changes meaning | a non-axios `Error('404')` still returns `false`; that test stays unchanged |

### Compatibility, docs, and scans

- Behaviour changes only for BioStar's definitive "user not found"; every other path is
  identical. No env, schema or API change. `docs/ai/*` unaffected.
- Optimization / cache scan: not worth it, left as is.

### Rollback

`git revert -m 1 <merge>`. No data repair: a flag reset for a user BioStar does not hold has
nothing to repair.
