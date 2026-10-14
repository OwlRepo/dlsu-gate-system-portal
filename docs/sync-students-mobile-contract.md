# Mobile guide: the new student sync (`GET /sync/students`)

For: the mobile app developer. Source of truth: `apps/backend/src/sync/`. Written for people who have not seen the backend code.

## 1. The idea in 30 seconds

- **Today:** every sync downloads **all** students (about 21,000 rows, roughly 8 MB uncompressed in our local measurement) and saves them.
- **New:** the **first** sync downloads everyone **once, in pages**. Every **later** sync downloads **only the students who changed**, and tells you which ones were archived so you can remove them.
- **Nothing breaks if you wait:** the old call with no parameters still works exactly as before. Switch when you are ready.
- **One thing is gone from this endpoint:** the `Photo` field. See section 8.

## 2. What you need to change (checklist)

- [ ] **1. Make `ID_Number` unique in your local students table** (needed so an "upsert" can find the existing row).
- [ ] **2. Store one new value:** `studentsSyncToken` (a string, empty on a fresh install). Keep it in the local database or secure storage, not only in memory.
- [ ] **3. Add the first-sync flow** (section 4A): loop through pages with `limit`, then replace your local students table.
- [ ] **4. Add the delta-sync flow** (section 4B): send `since=<studentsSyncToken>`, upsert changed students, **delete archived ones**.
- [ ] **5. Save `studentsSyncToken` last**, only after everything from that sync is saved (section 6, rule 3).
- [ ] **6. Stop reading `Photo`** from this endpoint; get a photo per student when you need it (section 8).
- [ ] **7. Handle failures** the way the table in section 7 says.
- [ ] **8. Run the test list** in section 9.

## 3. The calls

Same server, same login (`Authorization: Bearer <your token>`) as today.

| Call | What you get |
|---|---|
| `GET /sync/students` | **Old behaviour.** `{ "students": [...] }`, every non-archived student, no paging. Keep using it until you ship the new flow. |
| `GET /sync/students?limit=2000` | **First sync, page 1.** Non-archived students only. |
| `GET /sync/students?limit=2000&cursor=<nextCursor>` | **Next page** of the same download. Do not add `since`. |
| `GET /sync/students?limit=2000&since=<studentsSyncToken>` | **Delta.** Students that changed since your last finished sync, **archived ones included**. |

- `limit` is 1 to 5000. If you send any of the three parameters and no `limit`, the server uses 2000. About 0.8 MB per page of 2,000 students (measured locally on test data; your real size depends on field lengths).
- The server returns students sorted in a fixed order, so pages never overlap or skip.

## 4. Step by step

### 4A. First sync (empty local table, or no saved `studentsSyncToken`)

**Request 1**

```
GET /sync/students?limit=2
```

**Response 1** (shown with `limit=2` so it is short; use 2000 in the app)

```json
{
  "students": [
    {
      "id": 1,
      "ID_Number": "12100001",
      "Name": "Dela Cruz, Juan",
      "Lived_Name": null,
      "Remarks": null,
      "Campus_Entry": "Y",
      "Unique_ID": "3492455443",
      "isArchived": false,
      "group": "STUDENT",
      "date_activated": null,
      "date_deactivated": null,
      "expiry_datetime": null,
      "remarks_clear_pending": false,
      "biostar_row_hash": null,
      "remarks_checked_at": null,
      "createdAt": "2026-01-01T00:00:01.000Z",
      "updatedAt": "2026-01-01T00:00:01.000Z"
    },
    { "id": 2, "ID_Number": "12100002", "...": "same fields as above" }
  ],
  "nextCursor": "aXwyMDI2LTAxLTAxIDAwOjAwOjAyfDI",
  "syncToken": null
}
```

`nextCursor` is not `null`, so there is another page. **Copy it exactly; do not edit or decode it.**

**Request 2**

```
GET /sync/students?limit=2&cursor=aXwyMDI2LTAxLTAxIDAwOjAwOjAyfDI
```

**Response 2** (the last page)

```json
{
  "students": [ { "id": 3, "ID_Number": "12100003", "...": "same fields" } ],
  "nextCursor": null,
  "syncToken": "ZHwyMDI2LTAxLTAxIDAwOjAwOjAzfDM"
}
```

`nextCursor` is `null` → that was the last page. **Now** save `syncToken` as your `studentsSyncToken` (after saving the students, section 6 rule 3).

Notes: a first sync never contains archived students. Real syncs take about 11 requests of 2000 rows each.

### 4B. Every later sync (you have a saved `studentsSyncToken`)

**Request**

```
GET /sync/students?limit=2000&since=ZHwyMDI2LTAxLTAxIDAwOjAwOjAzfDM
```

**Response** (an example of a later sync, after student 1 was renamed and student 2 was archived)

```json
{
  "students": [
    { "id": 3, "ID_Number": "12100003", "isArchived": false, "...": "repeated, harmless" },
    { "id": 1, "ID_Number": "12100001", "Name": "Dela Cruz, Juan A.", "isArchived": false, "...": "changed" },
    { "id": 2, "ID_Number": "12100002", "isArchived": true, "...": "archived, remove it" }
  ],
  "nextCursor": null,
  "syncToken": "ZHwyMDI2LTAzLTA1IDA5OjQxOjEyLjQ4MjkxM3wxNTMw"
}
```

For each student in the response:

- `isArchived: true` → **delete** that student from your local table (match on `ID_Number`).
- otherwise → **upsert** (insert, or update the row with the same `ID_Number`).

Then save the returned `syncToken`. If `nextCursor` is not `null`, request more pages with `&cursor=` exactly as in 4A (leave out `since` on those). If nothing changed you still get `students: []` or just a few repeated rows, and a `syncToken` to save.

**Why you may see students you already have:** the server deliberately re-sends the last 10 minutes of changes every time, so a change that was still being saved on the server during your last sync is not missed. Upsert makes this harmless.

## 5. The whole algorithm in plain steps (no specific language)

```
syncStudents():
    token = storage.get("studentsSyncToken")        # empty on a fresh install
    if token is empty: firstSync()
    else:              deltaSync(token)

firstSync():
    staging = a new empty table with the same columns as students
    cursor = none
    repeat:
        page = GET /sync/students?limit=2000   (add &cursor=cursor when cursor is set)
        staging.upsertAll(page.students)       # keyed by ID_Number
        cursor = page.nextCursor
    until cursor is none
    newToken = page.syncToken                  # from the LAST page
    in ONE transaction:
        replace the students table with staging
        storage.set("studentsSyncToken", newToken)

deltaSync(token):
    cursor = none
    repeat:
        if cursor is none: page = GET /sync/students?limit=2000&since=token
        else:              page = GET /sync/students?limit=2000&cursor=cursor
        apply page.students:  isArchived -> delete by ID_Number, else upsert by ID_Number
        cursor = page.nextCursor
    until cursor is none
    storage.set("studentsSyncToken", page.syncToken)     # LAST thing you do
```

If your database cannot do a staging table: upsert each page straight into the students table while remembering every `ID_Number` you saw, and after the last page delete the local rows whose `ID_Number` was not seen, all in one transaction with saving the token.

Do not hold all 21,000 students in memory; handle one page at a time.

## 6. Rules (these are what keep the data correct)

1. **Upsert by `ID_Number`, never blind insert.** The same student can arrive twice (overlap, retries). With a unique `ID_Number` this is harmless.
2. **`isArchived: true` means delete locally.** Archived students are not sent in a first sync, but they are sent in deltas, and this is the only way you find out.
3. **Save `studentsSyncToken` last.** If the app is killed halfway, nothing is saved, and the next run simply starts again from the old token. Safe, as long as the token is never saved early.
4. **Never build, edit or parse a `cursor` or `syncToken`.** Store and send them back exactly as received. The format can change without notice.
5. **Never send `cursor` and `since` together** (the server answers 400).
6. **A first sync replaces the local table.** Do not merge it into old data, or students archived long ago would stay on the phone.
7. **If anything looks wrong, clear `studentsSyncToken` and run a first sync.** It is always safe.

## 7. When things go wrong

| What happened | What to do |
|---|---|
| `400 Bad Request` | The token or `limit` was rejected. Clear `studentsSyncToken`, run a first sync. Log the message. |
| `401 Unauthorized` | Your login expired. Log in again, then **repeat the same request**. |
| No network, timeout, or `5xx` mid-sync | Retry the **same request** (same URL) a few times with a pause. If it keeps failing, stop **without** saving the token; the next run continues safely from the old token. |
| App closed or crashed mid-sync | Nothing to do. Nothing was saved, so the next run repeats the sync. |
| You received a student you already have | Normal. Upsert handles it. |
| `students` is empty and `nextCursor` is `null` | Nothing changed. Save the returned `syncToken` (if it is not `null`) and finish. |

## 8. Photos

`Photo` is **not** in this response any more (it made the download huge). To show a photo, ask for one student when needed:

```
GET /students/12100001
```

It returns `{ "ID_Number", "Name", "Photo", "Unique_ID" }`. That is one request per student, so fetch it only when you display the student and keep what you get. If you need photos in bulk, tell the backend team; that would be a separate endpoint.

## 9. How to test your change

1. **Fresh install:** run the app, sync. The local count equals the number of non-archived students. Check you made about 11 requests, not 1.
2. **Sync twice in a row:** the second sync returns few rows and your data does not change.
3. **Archived student:** ask the backend team to archive one test student, sync, and confirm it disappears from your local table.
4. **Changed student:** change a test student's name, sync, confirm the update.
5. **Kill the app between pages of a first sync:** reopen, sync again. It finishes with no duplicates.
6. **Turn the network off mid-sync:** confirm `studentsSyncToken` did **not** change.
7. **Corrupt the saved token on purpose** (type junk): confirm the app recovers with a first sync instead of crashing.
8. **An old app build** (no parameters) still works.

Try the calls by hand first (replace the placeholders):

```
curl -H "Authorization: Bearer <your token>" "https://<server>/sync/students?limit=2"
curl -H "Authorization: Bearer <your token>" "https://<server>/sync/students?limit=2&cursor=<nextCursor>"
curl -H "Authorization: Bearer <your token>" "https://<server>/sync/students?limit=2000&since=<syncToken>"
```

## 10. Good to know

- The server caches each exact URL for **5 minutes**, so a delta can be up to 5 minutes behind.
- Order of fields and extra fields can grow over time: read fields by name, ignore ones you do not know.
- Rolling out: the old and new calls both work, so ship the app update whenever you are ready; you do not need to coordinate a switch day with the backend, except for the photo change in section 8.

## 11. Questions we need you to answer

1. Does your local database support a **unique index on `ID_Number`**, a **transaction**, and a **staging table** (or the "mark what you saw" alternative in section 5)?
2. How do you get student photos today, and is one request per student acceptable for your screens?
3. Do you need anything else in the response?
