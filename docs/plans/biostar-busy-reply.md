## BioStar "busy" reply crashes the BioStar → Postgres sync (photo never arrives)

**TL;DR.** A post office that, when overloaded, hands back a slip saying "busy, come back" in
an envelope that looks like a normal delivery. Our sync opens it, finds no parcels, and either
gives up for the whole day or concludes the parcel does not exist.

When BioStar is busy it answers HTTP 200 with `Response.code "4"` and no data. The pull reads
that as fatal and stops, so `91000124`'s photo never reaches Postgres or the mobile app.
Three other readers take the same reply as a real "empty" answer, which can blank a card or
wipe a stored photo.

```
Task Classification:
- Intent: Bug · Workflow: bugfix (RCA → plan → TDD) · Size: Standard
- Domain: database-sync (Dasma path) / BioStar · Risk: High (card-blank and photo-wipe paths)
- Contract Areas: BioStar GET /api/users, GET /api/users/{id}, POST /api/audit/search reply shapes
```

### RCA (approved by Romeo 2026-09-25: "ok do that")

- **Symptom.** `91000124` has a photo in BioStar, `Photo` is null in Postgres, and the mobile
  app shows no photo. Local `biostar_sync_state`: `lastSuccessAt 2026-09-23 18:56`,
  `lastError "Invalid response format from Biostar API"`. Every pull since has died.
- **Reproduced live (read-only), 2026-09-25.** `GET /api/users?limit=500&offset=0&order_by=name:true`
  → HTTP 200 `{"Response":{"task_id":"210","code":"4","message":"Synced Web Request is not respond in timeout period"}}`.
  The same call seconds later returned 500 rows in under 1 s, so the reply is transient.
  The BioStar detail for `91000124`, `91000007` and `91000002` holds the photo (`/9j/…`).
- **Root cause.** `database-sync-dasma-path.service.ts:241–246` throws on a missing
  `UserCollection` with no retry, which kills the whole pull.
  - Disproved if: a pull fails while every list reply carries `UserCollection`.
- **Same reply misread elsewhere** (`biostar-api.service.ts`):
  - `fetchBiostarUserDetail` (`:263–272`) returns `{Response…}` as the user's detail with
    `definitive: true`. It has no `cards`, so `resolveCsn` gets csn `''` and the row can go out
    with a blank card (gate-access risk). It has no `photo`, so the pull can store `Photo: null`.
  - `listUserCardCounts` (`:368–380`) reads a missing `UserCollection` as total 0 → `complete:
    true` with a partial or empty map → listed card-holders look card-less (same blank-card risk).
  - `listAuditPhotoChanges` (`:448`) reads a missing `AuditCollection` as "no photo changes" →
    the audit window closes past a replaced photo.
- **Eliminated.**
  - The candidate filter: `photoExists && !held.hasPhoto` marks drift, `:326–331`.
  - Our 2026-09-23/24 releases: the list and throw code predate them, and the reply is BioStar's.
  - The mobile endpoints: they read Postgres `Photo`, which is null.
- **Gate-access invariants.** No `studentMutationLock`, rollback, role or `reports` change. The
  fix removes a way to blank a card (the "no blanked card" guarantee in the 2026-09-23 plan).
- **Confidence.** High: reproduced live, and all four readers traced.

### Task metadata

- Docs loaded: `planning.md, plan-template.md` (+ `prompts/bugfix-rca.md`, `prompts/bugfix-plan.md`, `task-router.md`, `execution.md`).
- Claims reversed: "the photo path is broken". It is not; the pull never gets that far.
- Model: Claude Opus 5.5 · every phase `opus`, high (no switch stop).
- Branch: `fix/no-ticket-biostar-busy-reply` from `origin/main` (`798ebd2`). Release: merge → push `main` (Romeo: "once passed push directly to main").
- Personas: `test-engineer` RED → `nestjs-backend-dev` GREEN → `code-reviewer` + `security-auditor`. No DB change.
- Graphify: skipped (Romeo's standing instruction). Preflight:
  `git fetch origin && sh scripts/new-task-worktree.sh fix biostar-busy-reply`, then link `apps/backend/logs`.
- Wording: all comments, test names and commits pass the `/fuck-slop` scan (Romeo, 2026-09-25).

Paths: `B` `…/shared/biostar-api.service.ts` · `BS` its spec · `D` `…/database-sync-dasma-path.service.ts`
· `FB` `apps/backend/test/fake-biostar-server.ts` · `E2E` `apps/backend/test/dasma-sync-biostar.e2e-spec.ts`
· `DOC` `docs/ai/dev-environment.md`.

### Phase 1 — RED

**`FB`.** Old:
```ts
  missingUserAnswer?: { status: number; code: string };
}
```
New:
```ts
  missingUserAnswer?: { status: number; code: string };
  /** GET /api/users answers "busy" (HTTP 200, Response.code "4") this many times first. */
  listBusyReplies?: number;
  /** GET /api/users/:id answers "busy" this many times first. */
  detailBusyReplies?: number;
}
```
Old:
```ts
    if (method === 'GET' && /^\/api\/users(\?|$)/.test(url)) {
      const params = new URL(url, this.baseUrl).searchParams;
```
New:
```ts
    if (method === 'GET' && /^\/api\/users(\?|$)/.test(url)) {
      const listBusyLeft = this.scenario.listBusyReplies ?? 0;
      if (listBusyLeft > 0) {
        this.scenario.listBusyReplies = listBusyLeft - 1;
        this.json(res, 200, BUSY_REPLY);
        return;
      }
      const params = new URL(url, this.baseUrl).searchParams;
```
Old:
```ts
      if (method === 'GET') {
        const detail = this.userDetails[userId];
```
New:
```ts
      if (method === 'GET') {
        const detailBusyLeft = this.scenario.detailBusyReplies ?? 0;
        if (detailBusyLeft > 0) {
          this.scenario.detailBusyReplies = detailBusyLeft - 1;
          this.json(res, 200, BUSY_REPLY);
          return;
        }
        const detail = this.userDetails[userId];
```
Old: `export class FakeBiostarServer {` → New:
```ts
/** BioStar's reply when it is too busy to answer, captured live 2026-09-25. */
const BUSY_REPLY = {
  Response: {
    task_id: '210',
    code: '4',
    message: 'Synced Web Request is not respond in timeout period',
  },
};

export class FakeBiostarServer {
```

**`BS`** (a `busy` reply mock `{ data: { Response: { code: '4' } } }`):
- In `describe('BiostarApiService.fetchBiostarUserDetail'`, before `const fetch = () =>` add:
  `const busy = { data: { Response: { code: '4', message: 'Synced Web Request is not respond in timeout period' } } };`
  and after the helper add:
  - `error: a busy reply is not an answer about the user` — `axios.get` resolves `busy` →
    `resolves.toEqual({ detail: null, status: 200, definitive: false })`.
  - `edge: a user whose detail comes without a User wrapper is still read` — resolves
    `{ data: { user_id: 'ZZTEST001', photo: '/9j/X' } }` → `detail.photo` `'/9j/X'`,
    `definitive: true`.
- Before `it('error: logs one line, not two, for a detail failure it cannot explain'` add:
  `regression: a busy user list is no directory at all` — `axios.get` resolves
  `{ data: { Response: { code: '4' } } }` → `listUserCardCounts` resolves `null`.
- Before `it('edge: reads the user id from the last parentheses, whatever the name holds'` add:
  `regression: a busy audit reply leaves the photo changes unknown` — `axios.post` resolves
  `{ data: { Response: { code: '4' } } }` → `listAuditPhotoChanges` resolves `null`.

**`E2E`**, directly before
`    // Defence in depth, not the mechanism: drift detection is what catches a` (inside the
describe that holds `listRow` and `state`):
```ts
    // Measured 2026-09-25: BioStar answered the user list with HTTP 200 and
    // Response.code "4" while busy. Every pull died on it, and 91000124's
    // photo never reached PostgreSQL.
    describe('BioStar busy reply (HTTP 200, Response.code "4")', () => {
      beforeEach(async () => {
        service = await makeService({ BIOSTAR_BUSY_RETRY_MS: '10' });
      });

      it('error: a pull stops after three busy answers and records no success', async () => {
        biostar.listPages = [{ total: 1, rows: [listRow()] }];
        biostar.scenario.listBusyReplies = 3;

        await expect(service.syncFromBiostar('e2e-busy-1')).rejects.toThrow(
          /Invalid response format/,
        );

        expect((await state()).lastSuccessAt ?? null).toBeNull();
      }, 90000);

      it('edge: a busy detail reply never erases a stored photo', async () => {
        biostar.listPages = [{ total: 1, rows: [listRow()] }];
        biostar.userDetails['12100001'] = {
          user_id: '12100001',
          photo: '/9j/KEEP',
          cards: [{ card_id: '5551234' }],
        };
        await service.syncFromBiostar('e2e-busy-2');
        biostar.scenario.auditRows = [
          { CONTENT: 'audit.user.photo', TARGET: 'Dela Cruz, Juan(12100001)' },
        ];
        biostar.scenario.detailBusyReplies = 10;

        await service.syncFromBiostar('e2e-busy-3').catch(() => undefined);

        expect((await byId('12100001')).Photo).toBe('/9j/KEEP');
      }, 90000);

      it('regression: a pull retries a busy user list and brings the photo in', async () => {
        biostar.listPages = [{ total: 1, rows: [listRow()] }];
        biostar.userDetails['12100001'] = {
          user_id: '12100001',
          photo: '/9j/NEW',
          cards: [{ card_id: '5551234' }],
        };
        biostar.scenario.listBusyReplies = 2;

        await service.syncFromBiostar('e2e-busy-4');

        expect((await byId('12100001')).Photo).toBe('/9j/NEW');
      }, 90000);
    });

```
The happy path is the existing pull tests (for example `writes a photo and a card into
PostgreSQL`), which must stay green.

RED run: `npm run tdd:red`, then
`cd apps/backend && TZ=Asia/Manila npx jest --config ./test/jest-e2e.json -t "busy reply"`.
- Must fail: `BS` detail error, both `BS` regression tests, `E2E` regression.
- May pass: `BS` detail edge (pins current behaviour) and `E2E` error (it throws today too).
- `E2E` edge must fail if today's code wipes the photo. If it passes, record that in the PR:
  it then pins the guarantee without proving the bug.

Any other failure: stop and report. Commit `test(dasma): RED for BioStar's busy reply`.

### Phase 2 — GREEN

**`B`** Old: `/**\n * BioStar's user list reduced to card counts.` → prepend:
```ts
/**
 * True when BioStar sent an error envelope instead of data: HTTP 200 with a
 * non-zero Response.code. Measured 2026-09-25: code "4", "Synced Web Request
 * is not respond in timeout period", when BioStar is too busy to answer.
 */
export function isBiostarErrorReply(data: unknown): boolean {
  const code = (data as { Response?: { code?: unknown } } | null | undefined)
    ?.Response?.code;
  return code !== undefined && code !== null && String(code) !== '0';
}

```
`fetchBiostarUserDetail` Old:
```ts
        const data = response.data;
        const user = data?.User ?? data;
```
New:
```ts
        const data = response.data;
        // A busy BioStar says nothing about this person. Reading its reply as
        // the detail meant "no card, no photo": a blank card could go out and a
        // stored photo could be erased. Retried, then reported as no answer.
        if (!data?.User && isBiostarErrorReply(data)) {
          lastStatus = response.status ?? 200;
          if (attempt < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
            continue;
          }
          this.logger.warn(
            `[Dasma Biostar] BioStar gave no answer for user ${userId} after ${attempt + 1} attempt(s): ${JSON.stringify(data?.Response ?? null)}`,
          );
          return { detail: null, status: lastStatus, definitive: false };
        }
        const user = data?.User ?? data;
```
`listUserCardCounts` Old:
```ts
        const collection = response.data?.UserCollection;
        const rows = (collection?.rows ?? []) as Record<string, unknown>[];
```
New:
```ts
        const collection = response.data?.UserCollection;
        // No list is no directory: reading it as zero users would mark every
        // card-holder card-less and let a blank card through.
        if (!collection) {
          this.logger.warn(
            `[Dasma Biostar] BioStar returned no user list (${JSON.stringify(response.data?.Response ?? null)}); card lookups fall back to one request per user`,
          );
          return null;
        }
        const rows = (collection.rows ?? []) as Record<string, unknown>[];
```
and Old `const total = parseInt(String(collection?.total ?? 0), 10) || 0;` → New
`const total = parseInt(String(collection.total ?? 0), 10) || 0;`

`listAuditPhotoChanges` Old:
```ts
        const rows = (response.data?.AuditCollection?.rows ?? []) as Record<
```
New:
```ts
        if (isBiostarErrorReply(response.data)) {
          this.logger.warn(
            `[Dasma Biostar] BioStar did not answer the audit search (${JSON.stringify(response.data?.Response ?? null)}); photo replacements wait for the next run`,
          );
          return null;
        }
        const rows = (response.data?.AuditCollection?.rows ?? []) as Record<
```

**`D`** Old: `const AUDIT_OVERLAP_MS = 5 * 60 * 1000;` → New: that line, then
```ts

/** Times the user list is asked for when BioStar answers "busy". */
const BIOSTAR_BUSY_ATTEMPTS = 3;
```
Old:
```ts
    const walksWholeList = offset === 0;
```
New:
```ts
    const walksWholeList = offset === 0;
    const parsedBusyRetryMs = parseInt(
      String(this.configService.get('BIOSTAR_BUSY_RETRY_MS') ?? ''),
      10,
    );
    const busyRetryMs =
      Number.isFinite(parsedBusyRetryMs) && parsedBusyRetryMs >= 0
        ? parsedBusyRetryMs
        : 5000;
```
Old (the list request through the throw):
```ts
        const listStart = Date.now();
        const response = await axios.get(`${apiBaseUrl}/api/users`, {
          params,
          headers: {
            Authorization: `Bearer ${token}`,
            'bs-session-id': sessionId,
            accept: 'application/json',
          },
          httpsAgent: new https.Agent({
            rejectUnauthorized: false,
          }),
          timeout: 120000,
        });

        this.commonService.addElapsed(timingsMs, 'listFetch', listStart);
        const userCollection = response.data?.UserCollection;
        if (!userCollection) {
          throw new BadRequestException(
            'Invalid response format from Biostar API',
          );
        }
```
New:
```ts
        const listStart = Date.now();
        const fetchPage = () =>
          axios.get(`${apiBaseUrl}/api/users`, {
            params,
            headers: {
              Authorization: `Bearer ${token}`,
              'bs-session-id': sessionId,
              accept: 'application/json',
            },
            httpsAgent: new https.Agent({
              rejectUnauthorized: false,
            }),
            timeout: 120000,
          });
        // A busy BioStar answers HTTP 200 with Response.code "4" and no list
        // (measured 2026-09-25). It means "ask again", so the page is retried
        // before the run gives up; one busy moment used to end the whole pull.
        let response = await fetchPage();
        for (
          let attempt = 1;
          !response.data?.UserCollection && attempt < BIOSTAR_BUSY_ATTEMPTS;
          attempt++
        ) {
          this.logger.warn(
            `[Dasma Biostar] BioStar did not return the user list at offset=${offset} (attempt ${attempt}/${BIOSTAR_BUSY_ATTEMPTS}): ${JSON.stringify(response.data?.Response ?? null)}`,
          );
          await new Promise((r) => setTimeout(r, busyRetryMs * attempt));
          response = await fetchPage();
        }

        this.commonService.addElapsed(timingsMs, 'listFetch', listStart);
        const userCollection = response.data?.UserCollection;
        if (!userCollection) {
          throw new BadRequestException(
            `Invalid response format from Biostar API at offset=${offset}: ${JSON.stringify(response.data?.Response ?? null)}`,
          );
        }
```

**`DOC`** after the `BIOSTAR_FULL_SYNC_INTERVAL_HOURS` row add:
`| \`BIOSTAR_BUSY_RETRY_MS\` | base wait before re-asking BioStar for a user-list page it answered "busy" (Response.code 4); 3 attempts, waits grow 1×, 2× (default 5000) | Optional | tuning | tuning | database-sync Dasma path |`

Prettier, then commit `fix(dasma): retry BioStar's busy reply instead of reading it as data`.

### Phase 3 — Validation, review, live check, push

Validation:
```bash
cd apps/backend && npx tsc --noEmit && npx eslint src/database-sync test && TZ=Asia/Manila npx jest && TZ=Asia/Manila npx jest --config ./test/jest-e2e.json
```
Then `bun run build:backend && npm run tdd:gate`, plus the soak and replay scripts.

Expected counts:
- unit: 332 + 5 = **337**;
- e2e: 55 + 3 = **58**.

Review: `code-reviewer` + `security-auditor` (focus: no path left where a busy reply reads as
data).

Live check:
1. Merge to local `main` and run the backend.
2. Clear the resume offset in local `biostar_sync_state` so the pull walks from the start.
3. Romeo triggers "Biostar Sync".
4. Pass condition: Postgres `Photo` is filled for `91000124`, `91000007`, `91000008`,
   `91000014`, `91000016` and `91000021`; `lastSuccessAt` is today; `lastError` is null.

Push: fast-forward `main`.

| Regression risk | Proof |
|---|---|
| A real user without a `User` wrapper is read as busy | `BS` edge (unwrapped detail still read) |
| A busy detail wipes a photo or blanks a card | `BS` detail error + `E2E` edge |
| The pull loops forever on a busy BioStar | `E2E` error: stops after 3 attempts |
| A busy card directory treated as complete | `BS` regression → `null` → per-user lookups |

Rollback: `git revert -m 1 <merge>`; no data repair.

---

### Amendment (approved by Romeo 2026-09-25: "ok proceed"): page the user list by `user_id`

- **Evidence (live, read-only, 2026-09-25).**
  - `GET /api/users?limit=500&order_by=name:true` → 62 s, then code 4.
  - Same with `limit=100` → 63 s.
  - `order_by=user_id:false` (the documented default, per Suprema's "How To View A List Of
    Users") → 500 rows in 1.2 s; 50 rows in 0.3 s.
  - Conclusion: the name sort is what drives BioStar into its timeout.
- **Change.** `order_by: 'name:true'` → `'user_id:false'` in the `D` pull and in
  `B.listUserCardCounts`. `user_id` is unique, so pages cannot overlap or skip users, which also
  removes the incomplete card directory measured in L4. The retry stays as the safety net.
  - Out of scope, left as is: `main-path` and the `scripts/` tools.
- **Tests (RED first).**
  - `BS`, before `it('happy: maps every listed user to their card count across pages'`:
    `regression: pages the user list by user_id, the order BioStar serves fast`. It asserts the
    `axios.get` params carry `order_by: 'user_id:false'`.
  - `E2E`, before `    // Defence in depth, not the mechanism: drift detection is what catches a`:
    `regression: the pull asks for the user list in user_id order`. It asserts every
    `listQueries()` URL matches `/order_by=user_id(%3A|:)false/`.
- **Expected counts.** Unit 336 + 1 = **337**; e2e 58 + 1 = **59**.
- **Live check.** Same as above: the 6 photos arrive, and there are no busy warnings on the list.
