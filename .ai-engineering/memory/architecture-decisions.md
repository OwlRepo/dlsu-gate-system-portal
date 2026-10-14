# Architecture Decision Record

Decision:

Context:

Alternatives:

Tradeoffs:

Result:
Added an opt-in changes feed to GET /sync/students.

---

Decision: Page and diff the mobile roster with a keyset cursor on (COALESCE(updatedAt, createdAt, epoch), id), carried as PostgreSQL's own timestamp text.

Context: Production has ~21k students; mobile pulled all of them on every sync and stores them locally.

Alternatives: offset paging (skips/repeats rows when data changes mid-sync); id-only keyset (no deltas); expression index plus migration (not needed at 21k rows); a version column with a trigger (heavier, not needed with an overlap window); a JS Date cursor (milliseconds vs PostgreSQL microseconds loops on bulk-updated rows).

Tradeoffs: a 10-minute overlap re-sends a few rows per delta so a late-committing sync transaction is not missed; mobile must upsert idempotently. updatedAt is the transaction start time, so the overlap must stay longer than the longest sync transaction.

Result: GET /sync/students?limit&cursor&since, no schema change. Contract: docs/sync-students-mobile-contract.md.
Measured locally (21,000 synthetic rows, no index): 11 pages of 2000, avg 39 ms and max 58 ms per page, ~0.8 MB per page; the legacy full call was 8.3 MB and 455 ms. Reopen the no-index decision if a page in production exceeds ~200 ms.
