# DLSU-Lipa Scope Review — 2026-08-12 (66 min recording)

**Source:** `~/Movies/2026-08-12 21-07-27.mov` (screen-share of Notion page **"DLSU - LIPA"**, 38-row feature table + live comment column). Audio is Taglish, single channel, no speaker labels — role split below is by content type (build vs. ask), matching how the request was framed.

**Context:** DLSU-Lipa is a new deployment. The table classifies each feature as **Carry-Forward & Reconfiguration** (already built for DLSU-Dasma, this repo), **Partial / Enhancement**, or **Net-New Development**. Video goes idle after ~53:00.

**Fact-check basis:** every "code reality" line below was verified against `apps/backend` / `apps/portal-web` on `main` at commit `c270e54`. Where a claim in the Notion doc is wrong, it is called out.

---

## Part 1 — Romeo's engineering to-dos

Ordered by "do this first". Each item is written to be self-contained enough to open a fresh Claude session against.

### R1. Close the `/database-sync` role-guard hole *(security, do first)*

**Notion row 33** — "Role Guard Fix — /database-sync Endpoints: Restrict POST /database-sync/sync and /database-sync/biostar/sync to admin/super-admin roles."

**Code reality — the gap is real and currently exploitable by any logged-in user:**
- [apps/backend/src/database-sync/database-sync.controller.ts:32](apps/backend/src/database-sync/database-sync.controller.ts:32) — class-level `@UseGuards(JwtAuthGuard)` only.
- Every other route in the file carries `@UseGuards(RolesGuard)` + `@Roles(Role.ADMIN, Role.SUPER_ADMIN)`: `schedule` (:36–38), `schedules` (:117–119), `biostar/schedules` (:190–192), `biostar/schedule` (:222–224), `test-connection` (:266–268), `running-syncs` (:290–292), `delete-users` (:324–326).
- **`@Post('sync')` at :78 and `@Post('biostar/sync')` at :149 have neither.** Any authenticated principal — including `Role.EMPLOYEE` and `Role.USER` ([apps/backend/src/auth/enums](apps/backend/src/auth/enums)) — can kick off a full roster sync against BioStar.

**Work:** add `@UseGuards(RolesGuard)` + `@Roles(Role.ADMIN, Role.SUPER_ADMIN)` to both handlers. Per the repo's TDD rule (`.ai-engineering/core/engineering-rules.md`), write the failing guard test first — an e2e/controller test asserting 403 for an `employee`-role JWT on both routes, and 2xx for `admin`. This touches `database-sync`, which is a `.ai-engineering/core/safety.md` invariant area — read it before editing.

### R2. Decide and change the session/token lifetime

**Notion row 12** — "Session Auto-Logout: 15-minute inactivity timeout; configurable per role." **Meeting comment (typed live into the doc): `reco: 24hrs token expiration`.**

Discussion at ~08:35–09:36: a guard is monitoring a gate continuously; a 15-min forced re-login means missed taps. Expiry at end-of-shift is fine ("uuwi ang mga yan, okay lang mag-relogin bukas"). 15 min was called out as unreasonable ("ang lala naman yan").

**Code reality — currently 2 days, not 15 min and not 24h:**
- [apps/backend/src/app.module.ts:74](apps/backend/src/app.module.ts:74) — `signOptions: { expiresIn: '2d' }`
- [apps/backend/src/auth/auth.module.ts:28](apps/backend/src/auth/auth.module.ts:28) — `expiresIn: '2d', // Set a longer expiration as safety net`

**Work:** two JWT sign configs exist and must not drift — collapse them onto one env-driven value and set it to `24h`. Note the doc says *inactivity* timeout while the code has *absolute* expiry; if inactivity semantics are actually required, that needs a refresh/sliding-token mechanism, which is net-new (`/login` currently exposes only `login`, `employee`, `logout`, `validate` — [apps/backend/src/login/login.controller.ts](apps/backend/src/login/login.controller.ts)). Recommend: ship absolute 24h now, flag sliding-session as a separate scoped item.

### R3. Add security headers to the backend

**Notion row 32** — "Web Dashboard Security Headers (A+ Rating): HSTS, CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy on VeriFYI backend. Mozilla Observatory audit to verify A+."

**Code reality:** `rg` for `helmet|Strict-Transport|Content-Security-Policy|X-Frame-Options|Referrer-Policy|Permissions-Policy` across `apps/backend/src` and `apps/backend/package.json` returns **zero hits**. No helmet dependency, no manual header middleware.

**Work:** add `helmet` in [apps/backend/src/main.ts](apps/backend/src/main.ts) with an explicit CSP (default helmet CSP will break the Swagger UI this app serves — configure, don't accept defaults). Then run Mozilla Observatory against the deployed dashboard. Pure code-level and self-contained; Romeo flagged it as such at ~50:06.

### R4. Extend report exports beyond CSV

**Notion row 28** — "Advanced Reporting Engine: Filter by group, lane, and time of day. Attendance report templates: Late Arrivals, Early Departures, Absenteeism. Export formats: PDF, Excel/CSV, and TXT."

**Code reality — split this row; only part of it is a code task:**
- CSV export exists: `@Get('generate-csv')` at [apps/backend/src/reports/reports.controller.ts:382](apps/backend/src/reports/reports.controller.ts:382); deps are `csv-parse`, `csv-writer`, `fast-csv` only. **No PDF, no XLSX library** in `package.json`.
- Filter-by-group is feasible today: `student.group` column exists ([apps/backend/src/students/entities/student.entity.ts:38](apps/backend/src/students/entities/student.entity.ts:38)) and is already selected in [apps/backend/src/reports/reports.service.ts:231](apps/backend/src/reports/reports.service.ts:231).
- Filter-by-lane is feasible: `reports.device` and `reports.gate` columns exist ([apps/backend/src/reports/entities](apps/backend/src/reports/entities)).
- **The attendance templates are blocked, not buildable** — see K5. Romeo's own comment in the doc: *"We need to declare a time when class will start and end. threshold for absents."* Without class start/end times and an absence threshold there is no definition of "late" or "absent". Do not start this half.

**Work now:** PDF + XLSX exporters over the existing report query, plus group/lane/time-of-day filters. **Blocked:** Late Arrivals / Early Departures / Absenteeism templates.

### R5. Per-lane analytics widgets *(extension, not net-new)*

**Notion row 22** — marked "Partial / Enhancement", correctly.

**Code reality:** `@Get('analytics/gates')` ([apps/backend/src/reports/reports.controller.ts:329](apps/backend/src/reports/reports.controller.ts:329)) already aggregates counts **grouped by gate**, with `type` and date-range filters. Per-lane is the same aggregation grouped by `report.device` instead of `report.gate`.

**Work:** add a lane dimension to `getGateAnalytics` (or a sibling `analytics/lanes`), plus entry/exit ratio and busiest-lane derivations. Cheap. Confirm first whether "lane" maps to `device` or to a BioStar door — see K1.

### R6. Real-time occupancy meter *(enhancement on existing socket stats)*

**Notion row 19** — "People In minus People Out counter. Configurable capacity threshold alerts. Daily reset. Less than 1-second update via Socket.IO."

**Code reality — most of this already exists.** Romeo said as much at ~33:35 ("alam mo yung nasa dashboard natin may count ng in and out? … kaya kailangan ng enhancement lang"), and the code agrees:
- `getTodayStatsAggregate()` at [apps/backend/src/reports/reports.service.ts:331](apps/backend/src/reports/reports.service.ts:331) returns `{entry, exit, green, yellow, red, total}` for a date window in one SQL round-trip.
- `ReportsGateway` ([apps/backend/src/reports/reports.gateway.ts](apps/backend/src/reports/reports.gateway.ts)) already pushes `stats-update` over Socket.IO.

**Work:** derive `occupancy = entry − exit`, add a configurable capacity threshold + alert emission, and confirm the daily-reset boundary is `Asia/Manila` (the sync services already pin that TZ; the stats window should too). **Blocked on scope:** campus-level vs per-room — see K2.

### R7. Admin action audit trail

**Notion row 13** — "Partial / Enhancement — Immutable log of all admin actions: username, timestamp, IP address, action performed. Access event logs exist; admin action trail is net-new." **Meeting comment: `reco: date base per date`** (partition/retain by date). Retention discussion at ~10:36–15:27 landed on mark-for-archive → archive after ~1 month; a prior project's hard rule was ~4 months before wipe for data-privacy reasons, and a cron-driven file-dump backup was explicitly called out as adding points of failure.

**Code reality:** the doc's "net-new" call is correct. `rg -l -i audit` over `apps/backend/src` hits exactly one file — [apps/backend/src/database-sync/services/shared/database-sync-common.service.ts](apps/backend/src/database-sync/services/shared/database-sync-common.service.ts) — and that is not an admin-action trail. The `reports` table ([apps/backend/src/reports/entities](apps/backend/src/reports/entities)) is gate *access* events (`datetime, type, user_id, name, remarks, status, device, gate`), a different thing.

**Work:** new entity + interceptor capturing `{username, timestamp, ip, action, target}`, append-only, date-partitioned per the comment. Pair with a retention/purge policy — this overlaps rows 34 (Right to Erasure) and 35 (4-Tier Data Retention), so design all three together rather than three times.

### R8. Age-based facial recognition + employee opt-out *(needs new columns)*

**Notion rows 7 and 8** — auto-disable facial recognition under 18, auto-enable at 18 via the syncer; `face_recog_enabled` column mapping with opt-out propagation to BioStar2 (RA 10173 privacy-by-default).

**Code reality:** the doc labels both "Carry-Forward & Reconfiguration" — **this is optimistic.** `rg -i "face_recog|facial"` across `apps/backend/src` returns **zero hits**, and the `Student` entity ([apps/backend/src/students/entities/student.entity.ts](apps/backend/src/students/entities/student.entity.ts)) has `ID_Number, Name, Lived_Name, Remarks, Photo, Campus_Entry, Unique_ID, isArchived, group` — **no date of birth, no age, no `face_recog_enabled`**. The BioStar client surface in this repo is `/api/users` list + `csv_import` + delete only ([apps/backend/src/database-sync/services/shared/biostar-api.service.ts](apps/backend/src/database-sync/services/shared/biostar-api.service.ts), [database-sync-main-path.service.ts:82](apps/backend/src/database-sync/services/database-sync-main-path.service.ts:82)).

**Work:** requires (a) DOB or age on the source SQL Server view, (b) a `face_recog_enabled` column + migration, (c) a BioStar field to push it into. **Do not start until K3 confirms the source view exposes DOB** — without it this feature has no input.

### R9. MIFARE card / UID hex-to-decimal for Lipa card type

**Notion row 17** — "Partial / Enhancement" — correct.

**Code reality:** hex→decimal conversion already exists in three places: [database-sync-main-path.service.ts:276](apps/backend/src/database-sync/services/database-sync-main-path.service.ts:276), [shared/database-sync-common.service.ts:81](apps/backend/src/database-sync/services/shared/database-sync-common.service.ts:81), [database-sync.service.ts:264](apps/backend/src/database-sync/database-sync.service.ts:264) — all `parseInt(cleanUserId, 16)`.

**Work:** confirm the Lipa card type (Classic 1K vs DESFire EV1/EV2 — the doc says this must be settled *before hardware procurement*, see K4) and whether its UID length/byte order survives the existing `parseInt` path. If it does, this is a config change, not code. The three duplicated conversions are a consolidation candidate while you're in there.

### R10. Bulk deletion / deactivation — verify, don't rebuild

**Notion row 4** — "BioStar2 Bulk Deletion Module: DLSU-Lipa view mapping for bulk user deactivation; reads deletion list from SQL view."

**Code reality:** already built. `@Post('delete-users')` at [apps/backend/src/database-sync/database-sync.controller.ts:324](apps/backend/src/database-sync/database-sync.controller.ts:324) → `deleteUsers()` at [apps/backend/src/database-sync/database-sync.service.ts:859](apps/backend/src/database-sync/database-sync.service.ts:859), guarded admin/super-admin, DTO at `dto/delete-users.dto.ts`. Discussion at ~51:19 confirms the intent is bulk *deactivate*, and at ~24:05 that deactivation historically was done by setting the BioStar expiration date.

**Work:** re-point the SQL view for Lipa; verify deactivate-vs-delete semantics still match what Lipa wants. No new module.

### R11. Colour-coded GUI / historical remarks — no work

**Notion row 10** says "Carry-forward as-is from DLSU-Dasma — no code changes required." **Confirmed:** `getTodayStatsAggregate` already buckets `status LIKE 'GREEN%' / 'YELLOW%' / 'RED%'` ([reports.service.ts:344](apps/backend/src/reports/reports.service.ts:344)), and `reports.remarks` exists on the entity. Matches the ~24:35 description (green/yellow/red + remarks; an inactive user still physically enters and the guard is the one who stops them).

### R12. Things Romeo pushed back on — do not build without an explicit client decision

Argued down in the meeting; captured so they don't silently re-enter scope:

- **Row 11, MFA on super-admin** — comment typed live: `do we still need this?`. Argument at ~06:36–08:14: three surfaces (web/email/mobile), the admins are the same office, adds friction to a monitoring role, and "wala tayong perang pinag-uusapan dito" — classed as good-to-have.
- **Row 30, Mobile app with parent/guardian push** — argument at ~42:15–44:24: every parent needs an account application, and privacy-minded guardians will opt out, so adoption is partial by construction while the management burden is total. Romeo's position: recommend dropping it to Sir Warren / Sir Marcel.
- **Per-room access enforcement** (raised against rows 19/20/23) — argued at ~27:21–30:40: per-room means per-student schedule management, room-change handling, bypass paths, and someone assigned to run it daily; also a student can tap without entering, so it proves nothing about attendance. Romeo's position: **campus level only**.
- **Rows 37/38, inactive-state lifecycle** — at ~52:13–53:14: "good to have but not necessary… nagdadagdag lang ng friction." Real hazard named: the master record lives in the client's DB, so a user deactivated locally comes back **active** on the next sync. Any lifecycle work must be paired with a source-of-truth decision (K7) or the syncer will silently revert it. Note `Employee` already has `is_active` / `date_deactivated` ([apps/backend/src/employee/entities](apps/backend/src/employee/entities)) and `Student` has `isArchived`.

### R13. Not startable — dependent on Kindred's answers

Listed so a fresh session doesn't pick them up by mistake: **row 5** (BioStar2 zone config / anti-passback / fire-alarm zone / occupancy-limit zone), **row 21** (graphical lane map with remote force-open / lockdown), **row 23** (4-tier role-based access policy engine), **row 16** (FDAS integration), **rows 24/25/26/27/29** (SMTP / Telegram / Viber / notification templates / scheduled delivery), **row 31** (visitor QR). All blocked on K1–K9. For rows 21/23 in particular: this repo's BioStar client only ever calls `/api/users` — there is **no door, zone, or lockdown call anywhere in the codebase**, so "can BioStar even do this over API" is a genuine unknown, not a formality.

Also note **row 6 (SMS Notifications)** is labelled "Carry-Forward & Reconfiguration" but `rg -i "sms|twilio|semaphore"` over `apps/backend` returns **zero hits** — there is no SMS code in this repo. Either it lives in a component outside this monorepo or the carry-forward label is wrong. Resolve before it is estimated as a reconfiguration. (Meeting note at ~02:56: the SMS provider/gateway is the client's to supply and takes ~half a month to approve — the dependency starts now regardless.)

---

## Part 2 — Kindred: questions to ask / follow-ups

Comment-column entries typed into the Notion doc during the call, plus open threads raised verbally. Most are for **Sir Warren** (client side); a few are internal decisions.

### K1. "Is this BioStar level or ours?" — rows 5, 21, 23
The doc comment reads `is its biostar level?` on rows 5 and 23, and on row 21: *"Remote Force Open and Lockdown All commands from browser. we need to check if biostar is capable with this."* Ask Warren/Suprema: does BioStar2 expose **door/zone control over API** (force-open, lockdown-all), and are **anti-passback, fire-alarm zone, and occupancy-limit zone** configured in BioStar itself rather than built by us? Evidence this matters: our entire BioStar client is `/api/users` — no door/zone endpoint is used anywhere. Discussion at ~01:27–02:22 and ~31:10–33:03.

### K2. Campus level or per room? — rows 19, 20, and the whole per-room thread
Comment on both rows: `campus level or per room?`, with the follow-up already written in: *"if per room — check biostar capability, no student room schedule management."* Warren apparently mentioned BioStar readers going into classrooms with per-room tap. Ask: **is per-room actually in scope, and if so who manages the student→room schedule daily?** Romeo's read (~26:21) is that the API we pull is attendance-shaped in/out, not per-room in/out. Recommended answer to carry in: campus level.

### K3. What data will DLSU-Lipa actually give us? — rows 14, 15
Comments: `Student records (View)` / `Employee records (View)`. Row 14 says the client must expose a SQL view or REST API; row 15 the same from HR/IT. Ask Warren:
- Is HRIS a **separate** system with a separate dataset? Currently one column distinguishes employee from student (~16:58); Lipa may be genuinely split.
- Send Warren the list of fields we currently consume so he can map them (~15:57 — "papa-add ko sa kanya ano ang mga data, tayo pala magpaprovide").
- **Does the view include date of birth / age?** Blocks R8 entirely.
- **Does it include a `face_recog_enabled`-equivalent opt-out flag?**

### K4. MIFARE card type — needed *before* procurement — row 17
Ask: Classic 1K or DESFire EV1/EV2, and what UID format/length. The doc itself flags this as a pre-hardware-procurement decision. Also confirm (~05:03) that Lipa is card-based, same as ours.

### K5. Attendance definitions — blocks row 28
Romeo's own doc comment: *"We need to declare a time when class will start and end. threshold for absents."* Ask Warren for: class start time, class end time, late threshold, early-departure threshold, absence threshold. Then the harder question raised at ~39:39–41:48: students have **irregular schedules** (10am–12pm then 3pm–4pm) and teachers get absent, so a fixed 7-to-3 window produces false alarms. Ask: **is there a person assigned to manage and review this daily?** If not, recommend dropping the attendance templates.

### K6. What report, and what event? — rows 24, 25, 26, 27, 29
Comments typed in: `what report?` on rows 24 and 29, `what event triggers notification dispatch?` on rows 25 and 26, `clarification` on row 27. Ask Warren, per channel:
- **Which report** is scheduled/emailed (rows 24, 29)?
- **Which specific events** trigger Telegram (25) / Viber (26) dispatch? "All events" is not answerable — Romeo at ~36:57: "technically hindi pwede all… specific dapat kung anong event yan."
- Row 27 templates: how customisable? Romeo's position (~37:20) is a fixed notice with an editable message body, not an arbitrary template engine.
- **Row 26 has a hard external dependency:** Viber Business API needs third-party approval, 2–6 weeks. The doc says the client must initiate registration **immediately upon contract signing**. This is a dated action item, not a question.
- Same shape for **SMS (row 6)**: gateway/provider is the client's, ~half a month to approve (~02:56). Start it now.

### K7. Access denial by default + inactive lifecycle — rows 18, 37, 38
Comment on row 18: `clarification`. The substantive point (~22:22–23:52, ~52:25–53:14): **non-enrolled and inactive users should be cleaned at the client's DB, not ours.** Ask Warren:
- Who owns archive/delete on their side, and will they actually delete after archiving?
- What is the **criteria for "inactive"** — 30 days without activity? Something else? Row 38 has no definition.
- **Critical:** if we deactivate locally and their master record is still active, the next sync flips it back. Get an explicit source-of-truth ruling. This has bitten before ("bakit ito parin allowed pa rin?").

### K8. Visitor QR — registration process — row 31
Comment typed in: `Clarification / process of registration`. Ask Warren the actual desk flow (~46:21–49:36): who registers the visitor and how does admin know one is coming; what goes on the QR beyond name and purpose; printed or sent to the visitor's phone; is there a **dedicated visitor lane/turnstile**, and can that reader even read a QR (Romeo is unsure the deployed devices do QR vs face). Romeo's read: if this is rare and manual anyway, the code has to carry a switch to disable it cleanly.

### K9. FDAS (fire alarm) — row 16
Comment: `do we have software integration?` Ask Warren (partly asked at ~17:50–20:52; he said he'd get back):
- Can the **smoke detector / FDAS panel emit a signal** we or BioStar can consume at all?
- **Does this need software integration, or is the goal only "all gates open"?** Warren's stated goal was just gate-open on emergency — if so this is relay/civil works, not our software.
- If it *is* software: what should the app show — a device-plot map with the triggering alarm's location, an audible alert?
- The doc already notes **civil works + FDAS wiring specs must be provided by the client**.

### K10. Campus/sector dashboard — row 9
Comment: `do we have other campus?`. This row appears copied from the TAP project, which had two campuses (~04:03). Ask whether Lipa has multiple campuses/sectors at all — if not, strike the row.

### K11. Also to settle internally
- The doc has a trailing open line: **"Do we still have remarks?"** (~53:00) — no answer recorded before the video went idle.
- Rows 1/2 mention DLSU-Lipa **branding — new icon/logo** (~00:00). Get the asset files from the client.
- Row 3 mentions **new DB, new devices, new security-personnel/operator accounts** to set up.
- Data retention (~10:36–15:27): the precedent discussed was archive-after-~1-month and full wipe at ~4 months for privacy. Rows 34/35 propose biometrics purge 30 days post-separation, access logs anonymised after the enrollment year, visitor data 1–2 days, audit logs archived after 1 year. **These two do not agree** — confirm which policy Lipa is held to under RA 10173 before R7 is designed.

---

## Appendix — full 38-row feature table as reviewed

| # | Type | Feature | Live comment in doc |
|---|---|---|---|
| 1 | Carry-Forward | VeriFYI Client Module (Security View) | |
| 2 | Carry-Forward | VeriFYI Admin Module (Reports, Search, Enroll) | |
| 3 | Carry-Forward | BioStar2 API Tool — Database Connection | |
| 4 | Carry-Forward | BioStar2 Bulk Deletion Module | |
| 5 | Carry-Forward | BioStar2 Zone Configuration | is its biostar level? |
| 6 | Carry-Forward | SMS Notifications (IN/OUT per gate) | |
| 7 | Carry-Forward | Age-Based Facial Recognition Control | |
| 8 | Carry-Forward | Employee Facial Recognition Opt-Out | |
| 9 | Carry-Forward | Campus/Sector Dashboard Segmentation | do we have other campus? |
| 10 | Carry-Forward | Color-coded GUI, Historical Remarks, Hex-to-Decimal | |
| 11 | Net-New | Multi-Factor Authentication (Super-Admin) | do we still need this? |
| 12 | Net-New | Session Auto-Logout | reco: 24hrs token expiration |
| 13 | Partial | Admin Action Audit Trail | reco: date base per date |
| 14 | Net-New | School Management System Integration | Student records (View) |
| 15 | Net-New | HRIS Integration | Employee records (View) |
| 16 | Net-New | FDAS (Fire Alarm) Integration | do we have software integration? |
| 17 | Partial | MIFARE Card / ID System Integration | |
| 18 | Net-New | Access Denial by Default (Unofficial/Inactive) | clarification |
| 19 | Net-New | Real-Time Occupancy Meter | campus level or per room? |
| 20 | Net-New | Loitering / Duration Analysis | campus level or per room? if per room: check biostar capability, no student room schedule management |
| 21 | Net-New | Graphical Lane Map with Remote Control | we need to check if biostar is capable with this |
| 22 | Partial | Per-Lane Analytics Widgets | |
| 23 | Net-New | 4-Tier Role-Based Access Policy Engine | is its biostar level? |
| 24 | Net-New | Email (SMTP) Alerts and Scheduled Reports | what report? |
| 25 | Net-New | Telegram Bot Notifications | what event triggers notification dispatch? |
| 26 | Net-New | Viber Business Notifications | what event triggers notification dispatch? |
| 27 | Net-New | Customizable Notification Message Templates | clarification |
| 28 | Net-New | Advanced Reporting Engine | We need to declare a time when class will start and end. threshold for absents. |
| 29 | Net-New | Automated Scheduled Report Delivery | what report? |
| 30 | Net-New | Mobile Application (iOS & Android) | Clarification |
| 31 | Net-New | Visitor & QR Credential Management | Clarification / process of registration |
| 32 | Net-New | Web Dashboard Security Headers (A+ Rating) | |
| 33 | Net-New | Role Guard Fix — /database-sync Endpoints | |
| 34 | Net-New | Right to Erasure — Automated Purge Workflow | |
| 35 | Net-New | 4-Tier Automated Data Retention Schedule | |
| 36 | Partial | AES-256 Encryption at Rest | |
| 37 | Partial | Immediate Deactivation on Separation | |
| 38 | Partial | Inactive State Lifecycle Workflow | |
