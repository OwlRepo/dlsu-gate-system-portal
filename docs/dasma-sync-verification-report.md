# DASMA sync — verification report

**Date:** 2026-09-10 · **Branch:** `fix/dasma-tracker-round3` · **Commit:** `08bf024`

Answers DLSU's three issue trackers. Every verdict below was produced by seeding
the sandbox source view, BioStar and PostgreSQL with a scenario matrix and
running the real sync against it — not by reasoning about the code.

**Environments used (all sandbox, confirmed):** MSSQL `dlsu-dasma` (`dbo.TestTable`
→ `dbo.TestView`, 34 rows), BioStar 2 at `139.135.147.181:4433` (34 users),
PostgreSQL `localhost:5433/dlsu_gate_system` (36 students). All three were
captured before the campaign and restored after it.

---

## Verdict per tracker

| Tracker | Verdict | What the evidence shows |
|---|---|---|
| **Activation Logic / Expiry** — "expiry updated every day, always from today's date" | **Fixed** (with one correction shipped) | The window is read from the stored `date_activated` / `expiry_datetime`, never recomputed. Two consecutive runs a day apart now render byte-identical rows. Separately we found the fix had dropped the legacy 1-day safety margin, and restored it. |
| **Remarks Issue** — "removing a remark does not clear it" | **Fixed** | Removing a remark upstream produced exactly one `PUT` and BioStar now reports no remark. The clearing mechanism itself was already working; what was broken was that it also deleted remarks that were still present. |
| **Data Transfer** — "some ID numbers and images not synchronised" | **Fixed** — and the real cause was not what it looked like | Two separate causes, neither previously identified: new students were being silently locked out of BioStar entirely, and the mobile-facing endpoint cached the roster for an hour. |

---

## The headline numbers

| Measure | Before | After |
|---|---|---|
| New students in the source that reached BioStar | **1 of 14** | **14 of 14** |
| Rows dropped from the CSV as "card unresolved" | 13 | 0 |
| Students with `remarks_checked_at` never stamped | 18 and climbing | 0 (3 archived, correctly out of scope) |
| Rows sent when nothing changed upstream | the whole roster | **0** |
| `csv_import` calls when nothing changed | 1 per batch | **0** |
| A live remark deleted by a stale flag | yes | no — flag dropped instead |

Two consecutive live runs with nothing changed upstream:

```
csvExport : {"rowsEmitted":0,"rowsSuppressedUnchanged":45,"batchesSkippedNoChanges":1}
csvImport : []
```

That is the direct answer to *"khit wla nmn changes nag generate parin ng csv file
tpos binato sa biostar kaya nag rere enroll sa mga devices ng madaming user."*

### Only changed records are sent — measured end to end

A four-step cycle on the live sandbox, 34 students, changing exactly one of them:

| Step | Source state | Rows in the CSV | Sent to BioStar |
|---|---|---|---|
| 1 | nothing changed | **0** (34 suppressed) | nothing — no file uploaded at all |
| 2 | one remark added | **1** (33 suppressed) | 1 record |
| 3 | that remark removed | **1** (33 suppressed) | 1 record + 1 clear |
| 4 | nothing changed | **0** (34 suppressed) | nothing |

The file sent at step 2, in full — one header line and one record, and it is the
record that changed:

```
user_id,name,department,user_title,user_group,Remarks,csn,start_datetime,expiry_datetime,original_campus_entry
9933993,Shirley Cereno T,DLSU,EMPLOYEE,All Users,SINGLE ROW TEST,,2026-09-09 00:00:00.000,2036-09-10 00:00:00.000,Y
```

So BioStar only ever marks as modified the people who actually changed, and only
those people are re-transferred to the devices. When nothing changed, no
attachment is uploaded and no import is called — the run touches BioStar not at
all.

---

## What was actually wrong

Seven defects. Three trace to the trackers; four had never been reported.

### 1. New students could not be enrolled at all *(not reported — most severe)*

`resolveCsn` asked BioStar for each student's card. BioStar answers `400` for a
user it has never seen, and the code treated that identically to "BioStar is
unreachable" — holding the row back so as not to blank a card.

But a student who is in the source and not yet in BioStar is precisely who the
CSV exists to create, and there is no card to blank on a user who does not
exist. The result was a deadlock: **a student could not be enrolled because they
were not already enrolled.**

This was invisible on a settled roster, which is why it survived earlier
testing — every user already existed in BioStar. Seeding 14 new students exposed
it immediately: 13 dropped, 1 through (the one pre-created in BioStar).

Fix: the detail fetch now reports whether an empty answer was *definitive*. Only
a genuinely unknown answer holds a row back.

**Confirmed repaired on real data:** user `96526947`, stuck outside BioStar since
before this work, is now enrolled.

### 2. A stale flag deleted a live remark *(the 88888888 incident)*

On 2026-09-10 a single run exported `88888888,…,Sir Boss,…`, imported it
successfully, then cleared that same remark seconds later — acting on a
`remarks_clear_pending` flag left over from an earlier run without re-reading the
remark. Because the row hash was written in the same run, the next sync
suppressed the row as unchanged and the loss became permanent.

Fix: a pending flag is re-validated before it is acted on. Live proof — with a
stale flag armed against a student whose remark was still present, the run
reported `staleFlagsDropped: ["9990000010"]`, made no `PUT`, and the remark
survived intact.

### 3. The remark sweep never finished

The sweep only stamped `remarks_checked_at` on a successful lookup, so any user
BioStar returned `400` for was re-checked on every run, forever. Live, the count
of unstamped rows climbed from 2 to 18 during a single campaign. It is now 0 —
the 3 remaining are archived students, which the sweep correctly ignores.

### 4. A blank `csn` destroys a card — now measured, not assumed

The codebase contradicted itself about this for a long time. It is settled: a
one-row import with a blank `csn` under `import_option: 2` took a live user from
`card_count: 1, cards: ["7710000016"]` to `card_count: 0, cards: []`.

So carrying the current card through the CSV is not a nicety — it is what stops
the roster sync deleting cards enrolled in the BioStar UI. The
`DASMA_CSV_FETCH_CARD_FROM_BIOSTAR=false` branch emitted blanks without asking
anything; it now holds the row back. All three test suites had also defaulted
that flag to `false` — the opposite of production — so a large part of the suite
had been validating a configuration the deployment never runs.

### 5. BioStar's CSV parser rejects quoted newlines

A remark containing a line break is quoted correctly per RFC 4180 by our writer,
but BioStar read the continuation line as a new record and rejected it:
`User ID Type Mismatch.` One pasted newline silently costs that person their row
in the batch. Remarks are now flattened to a single line; the words survive.

### 6. A duplicated source ID re-imported forever

Two source rows sharing one ID render two different CSV lines under the same
`user_id`, but only one hash can be stored against the one student row —
so whichever variant lost that race mismatched on every later run and that
person was re-imported, and re-transferred to every device, on every sync. With
everything else quiet, one run still emitted exactly that row.

### 7. The exported start time had lost its safety margin *(not reported)*

Anchoring the window to the stored activation date fixed the drift, but it also
started exporting the activation *instant* — live BioStar held
`start_datetime: 2026-09-10T16:28:31Z` for 27 people. The legacy build always
sent `yesterday 00:00`, and that day of slack is what absorbs any disagreement
between this server's clock and the devices' about what timezone a bare
`YYYY-MM-DD HH:mm:ss.SSS` denotes. With zero margin, a student activated at
16:28 is at the mercy of that interpretation.

Now floored to the activation day and back-dated one day — still derived only
from the stored column, so it stays stable run to run.

### Also fixed

- A disabled row with no `date_deactivated` anchored its window to today and
  re-exported daily with nothing reporting why. Now named in diagnostics.
- `GET /sync/students` cached the entire roster for an hour, so a freshly synced
  photo stayed invisible to mobile for up to an hour — indistinguishable, from
  the device, from the photo never syncing at all. Now 5 minutes, and `src/sync/`
  has tests for the first time.

---

## Verification

- **243 unit tests + 22 end-to-end tests**, all green. Every fix has a regression
  test that fails against the previous code.
- **Live scenario matrix** — 23 seeded scenarios across MSSQL, BioStar and
  PostgreSQL, run before the fixes and again after. Harness committed at
  `apps/backend/scripts/scenario/`, with baseline capture and restore.
- **Sandbox restored** — MSSQL back to 34 rows, PostgreSQL to 36 students, zero
  seeded users left in BioStar, nothing lost.

```bash
TZ=Asia/Manila bun --cwd apps/backend run test
```

```bash
TZ=Asia/Manila bun --cwd apps/backend run test:e2e
```

---

## What to watch on release

**The first sync after this deploys is one full re-export.** Every active row's
rendered content changes because of the start-time correction, so every hash
changes once. That is expected and it is a one-time cost. **The second run is
the one to check** — it should report `rowsEmitted: 0` and make no imports.

## Still open, deliberately

- **Multi-card users.** One BioStar user holds 3 cards; the CSV carries a single
  `csn`, so an overwrite import may reduce them to one. Pre-existing, unrelated
  to this change, and it needs a decision about intended behaviour before code.
- **`/sync/students` payload size.** It returns the whole roster with photos
  inline — fine at 34 users, roughly 280 MB at a 20,000-row roster. Needs
  pagination before the roster grows.
- **The main (MTL) sync path** still recomputes expiry from today on every run —
  the original tracker complaint, in the path this work did not touch.
