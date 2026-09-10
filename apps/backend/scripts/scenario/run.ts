/**
 * run.ts — the live DASMA scenario harness.
 *
 *   bun --cwd apps/backend scripts/scenario/run.ts baseline
 *   bun --cwd apps/backend scripts/scenario/run.ts seed
 *   bun --cwd apps/backend scripts/scenario/run.ts observe <label>
 *   bun --cwd apps/backend scripts/scenario/run.ts mutate
 *   bun --cwd apps/backend scripts/scenario/run.ts restore
 *
 * `--cwd apps/backend` is required: the repo root has no tsconfig.json, so Bun
 * cannot see `emitDecoratorMetadata` and decorated imports fail to resolve.
 * Same constraint as scripts/biostar-probe.ts.
 *
 * All three targets are sandbox environments. `restore` puts every one of them
 * back, and `baseline` captures enough to check that it did.
 */

import {
  openSource,
  openPostgres,
  openBiostar,
  listBiostarUsers,
  getBiostarUser,
  deleteBiostarUsers,
  importCsv,
  putUser,
  writeSnapshot,
  banner,
  SOURCE_TABLE,
  runRosterSync,
  runBiostarSync,
  newestDiagnostics,
} from './lib';
import * as sql from 'mssql';
import {
  PHASE_1,
  S11_DUPLICATE,
  SEED_PREFIX,
  BIOSTAR_ONLY,
  PG_ONLY_UNKNOWN_TO_BIOSTAR,
  SEED_CARD_S14,
  SEED_CARD_S16,
  SourceRow,
} from './scenarios';

const SEED_LIKE = `${SEED_PREFIX}%`;

// --------------------------------------------------------------- helpers

async function insertSourceRow(
  pool: sql.ConnectionPool,
  row: SourceRow,
): Promise<void> {
  await pool
    .request()
    .input('ID', sql.VarChar(100), row.ID)
    .input('LastName', sql.VarChar(100), row.LastName)
    .input('FirstName', sql.VarChar(100), row.FirstName)
    .input('MiddleName', sql.VarChar(100), row.MiddleName)
    .input('Suffix', sql.VarChar(100), row.Suffix)
    .input('Grp', sql.VarChar(100), row.Group)
    .input('Status', sql.Bit, row.Status)
    .input('Remarks', sql.VarChar(100), row.Remarks)
    .input('IsArchived', sql.Bit, row.IsArchived).query(`
      INSERT INTO ${SOURCE_TABLE}
        (ID, LastName, FirstName, MiddleName, Suffix, [Group], Status, Remarks, IsArchived)
      VALUES
        (@ID, @LastName, @FirstName, @MiddleName, @Suffix, @Grp, @Status, @Remarks, @IsArchived)
    `);
}

async function sourceRows(
  pool: sql.ConnectionPool,
  onlySeeded = false,
): Promise<Record<string, unknown>[]> {
  const req = pool.request();
  let q = `SELECT * FROM ${SOURCE_TABLE}`;
  if (onlySeeded) {
    req.input('p', sql.VarChar(100), SEED_LIKE);
    q += ' WHERE ID LIKE @p';
  }
  const r = await req.query(`${q} ORDER BY ID`);
  return r.recordset;
}

// PostgreSQL folds unquoted identifiers to lower case, and this table was
// created with mixed-case names, so the capitalised ones must stay quoted.
const STUDENT_COLUMNS = [
  '"ID_Number"',
  '"Name"',
  '"Lived_Name"',
  '"Remarks"',
  '"Campus_Entry"',
  '"Unique_ID"',
  '"isArchived"',
  '"group"',
  'date_activated',
  'date_deactivated',
  'expiry_datetime',
  'remarks_clear_pending',
  'biostar_row_hash',
  'remarks_checked_at',
].join(', ');

// -------------------------------------------------------------- baseline

async function baseline(): Promise<void> {
  banner('BASELINE — capturing all three systems before anything is touched');

  const pool = await openSource();
  const src = await sourceRows(pool);
  await pool.close();

  const pg = await openPostgres();
  const students = await pg.query(
    `SELECT ${STUDENT_COLUMNS}, ("Photo" IS NOT NULL) AS has_photo FROM students ORDER BY "ID_Number"`,
  );
  const schedules = await pg.query('SELECT * FROM sync_schedule ORDER BY id');
  const syncState = await pg.query(
    'SELECT * FROM biostar_sync_state ORDER BY id',
  );
  await pg.end();

  const bs = await openBiostar();
  const list = await listBiostarUsers(bs);
  const details: Record<string, unknown> = {};
  for (const u of list) {
    const id = String(u.user_id);
    const d = await getBiostarUser(bs, id);
    // Photos are megabytes of base64 and are not what this snapshot is for.
    if (d && typeof d.photo === 'string') d.photo = `<${d.photo.length} chars>`;
    details[id] = d;
  }

  const file = writeSnapshot('baseline', {
    capturedAt: new Date().toISOString(),
    source: { table: SOURCE_TABLE, count: src.length, rows: src },
    postgres: {
      studentCount: students.rowCount,
      students: students.rows,
      syncSchedules: schedules.rows,
      biostarSyncState: syncState.rows,
    },
    biostar: { count: list.length, list, details },
  });

  console.log(`source rows      : ${src.length}`);
  console.log(`postgres students: ${students.rowCount}`);
  console.log(`biostar users    : ${list.length}`);
  console.log(`sync schedules   : ${schedules.rows.length}`);
  console.log(`\nwritten: ${file}`);
}

// ------------------------------------------------------------------ seed

async function seed(): Promise<void> {
  banner('SEED — phase 1 into MSSQL, BioStar and PostgreSQL');

  const pool = await openSource();
  const existing = await sourceRows(pool, true);
  if (existing.length > 0) {
    console.error(
      `ABORT: ${existing.length} row(s) matching ${SEED_LIKE} already exist in ${SOURCE_TABLE}. ` +
        'Run `restore` first — seeding twice would double the duplicate-ID scenario.',
    );
    await pool.close();
    process.exit(1);
  }

  for (const s of PHASE_1) {
    if (!s.row) continue;
    await insertSourceRow(pool, s.row);
    console.log(`  ${s.tag}  ${s.id}  ${s.proves}`);
  }
  // S-11's second physical row, same ID — the duplicate-key path.
  await insertSourceRow(pool, S11_DUPLICATE);
  console.log(`  S-11  ${S11_DUPLICATE.ID}  (duplicate row inserted)`);
  await pool.close();

  banner('SEED — BioStar-only users');
  const bs = await openBiostar();

  // A real photo, borrowed from a user who already has one, so the inbound
  // pull sees genuine JPEG base64 rather than something invented.
  const donorId = '88888888';
  const donor = await getBiostarUser(bs, donorId);
  const donorPhoto = typeof donor?.photo === 'string' ? donor.photo : null;
  console.log(
    donorPhoto
      ? `  photo donor ${donorId}: ${donorPhoto.length} chars`
      : `  WARNING: no photo on ${donorId}; S-15 will be seeded without one`,
  );

  await importCsv(bs, [
    {
      user_id: BIOSTAR_ONLY.inboundCreate,
      name: 'Sierra Inbound',
      remarks: '',
      csn: '',
    },
    {
      user_id: BIOSTAR_ONLY.blankCellProbe,
      name: 'Tango BlankProbe',
      remarks: 'BLANK_PROBE_REMARK',
      csn: SEED_CARD_S16,
    },
    {
      user_id: BIOSTAR_ONLY.staleRemark,
      name: 'Uniform StaleRemark',
      remarks: 'STALE_IN_BIOSTAR_ONLY',
      csn: '',
    },
    {
      user_id: BIOSTAR_ONLY.noPhotoNoCard,
      name: 'Victor NoPhotoNoCard',
      remarks: '',
      csn: '',
    },
    // S-14 exists in the source too; BioStar is where its card lives.
    { user_id: '9990000014', name: 'Mike Fourteen', csn: SEED_CARD_S14 },
  ]);
  console.log('  imported 5 BioStar rows');

  if (donorPhoto) {
    const res = await putUser(bs, BIOSTAR_ONLY.inboundCreate, {
      photo: donorPhoto,
    });
    console.log(`  S-15 photo PUT: ${JSON.stringify(res).slice(0, 160)}`);
  }

  banner('SEED — PostgreSQL states the source cannot produce');
  const pg = await openPostgres();

  // S-21: known to PostgreSQL, unknown to BioStar and to the source. BioStar
  // answers 400 for it, which today leaves remarks_checked_at null forever.
  await pg.query(
    `INSERT INTO students ("ID_Number", "Name", "Campus_Entry", "isArchived", "remarks_checked_at")
     VALUES ($1, $2, 'Y', false, NULL)
     ON CONFLICT ("ID_Number") DO UPDATE SET "remarks_checked_at" = NULL`,
    [PG_ONLY_UNKNOWN_TO_BIOSTAR, 'Whiskey UnknownToBiostar'],
  );
  console.log(
    `  S-21  ${PG_ONLY_UNKNOWN_TO_BIOSTAR}  remarks_checked_at = NULL`,
  );

  console.log(
    '\nS-20, S-22 and S-23 are applied by `seed-pg-states` AFTER the first sync,\n' +
      'because they mutate rows the sync itself has to create first.',
  );

  await pg.end();
}

/**
 * The PostgreSQL-side seeds that can only be applied once the sync has created
 * the rows they act on. Run this between run A and run B.
 */
async function seedPgStates(): Promise<void> {
  banner('SEED — post-run PostgreSQL states (S-20, S-22, S-23)');
  const pg = await openPostgres();

  // S-20: the live incident. A pending clear flag on a student whose source
  // remark is still very much present. Today this deletes a live remark.
  const s20 = await pg.query(
    `UPDATE students SET remarks_clear_pending = true
     WHERE "ID_Number" = '9990000002' RETURNING "ID_Number", "Remarks"`,
  );
  console.log(`  S-20  ${JSON.stringify(s20.rows)}`);

  // S-22: a disabled row with no deactivation date. Its exported window falls
  // back to today, so its hash changes every day with nothing reporting it.
  const s22 = await pg.query(
    `UPDATE students SET date_deactivated = NULL
     WHERE "ID_Number" = '9990000013' RETURNING "ID_Number", "Campus_Entry"`,
  );
  console.log(`  S-22  ${JSON.stringify(s22.rows)}`);

  // S-23: a hash that cannot match anything, proving the hash is what gates
  // re-export rather than some other comparison.
  const s23 = await pg.query(
    `UPDATE students SET biostar_row_hash = repeat('0', 64)
     WHERE "ID_Number" = '9990000001' RETURNING "ID_Number"`,
  );
  console.log(`  S-23  ${JSON.stringify(s23.rows)}`);

  await pg.end();
}

// ---------------------------------------------------------------- mutate

async function mutate(): Promise<void> {
  banner('MUTATE — phase 2 source changes for run B');
  const pool = await openSource();

  const q = async (label: string, query: string) => {
    const r = await pool.request().query(query);
    console.log(`  ${label}: ${r.rowsAffected[0]} row(s)`);
  };

  // The Remarks Issue tracker, exactly: a remark removed upstream.
  await q(
    'S-02 remark removed',
    `UPDATE ${SOURCE_TABLE} SET Remarks = NULL WHERE ID = '9990000002'`,
  );
  // Reactivation must restart the ten years from the new activation date.
  await q(
    'S-05 reactivated',
    `UPDATE ${SOURCE_TABLE} SET Status = 1 WHERE ID = '9990000005'`,
  );
  // Vanishing from the source must archive, never delete.
  await q(
    'S-12 removed from source',
    `DELETE FROM ${SOURCE_TABLE} WHERE ID = '9990000012'`,
  );
  // One field on one row — the only thing run B is allowed to re-export.
  await q(
    'S-01 surname changed',
    `UPDATE ${SOURCE_TABLE} SET LastName = 'Alpha-Changed' WHERE ID = '9990000001'`,
  );

  await pool.close();
}

// ------------------------------------------------------------------ sync

/**
 * Runs one full cycle through the RUNNING backend — roster out, then BioStar
 * in — and prints the two diagnostics blocks that answer the trackers.
 */
async function syncCycle(label: string): Promise<void> {
  banner(`SYNC — ${label} (roster out, then BioStar in)`);

  const rosterStatus = await runRosterSync();
  console.log(`  roster sync : ${rosterStatus}`);
  const outbound = newestDiagnostics('sql-server-to-postgres-to-biostar');

  const inbound = await runBiostarSync();
  console.log(`  biostar pull: ${JSON.stringify(inbound).slice(0, 200)}`);
  const inboundDiag = newestDiagnostics('biostar-to-postgres');

  const file = writeSnapshot(`sync-${label}`, {
    label,
    ranAt: new Date().toISOString(),
    rosterStatus,
    outbound,
    inbound: inboundDiag,
  });

  const o = outbound as Record<string, any> | null;
  if (o) {
    console.log('\n  --- outbound ---');
    console.log(`  seenFromSource        : ${o.seenFromSource}`);
    console.log(
      `  rowsChanged/unchanged : ${o.rowsChanged}/${o.rowsUnchanged}`,
    );
    console.log(`  csvExport             : ${JSON.stringify(o.csvExport)}`);
    console.log(`  csvImport             : ${JSON.stringify(o.csvImport)}`);
    console.log(`  remarks               : ${JSON.stringify(o.remarks)}`);
    console.log(
      `  expiryFallbackUsed    : ${JSON.stringify(o.expiryFallbackUsed)}`,
    );
    console.log(
      `  skippedValidation     : ${JSON.stringify(o.skippedValidation)}`,
    );
    console.log(`  archivedByReconciliation: ${o.archivedByReconciliation}`);
  }
  const i = inboundDiag as Record<string, any> | null;
  if (i) {
    console.log('\n  --- inbound ---');
    console.log(
      `  discovered/candidates : ${i.discovered}/${i.candidatesAccepted}`,
    );
    console.log(`  excludedNoPhotoNoCard : ${i.excludedNoPhotoNoCard}`);
    console.log(`  created/updated       : ${i.created}/${i.updated}`);
    console.log(
      `  missingFromPostgres   : ${JSON.stringify(i.missingFromPostgres)}`,
    );
    console.log(
      `  remarksBackfilled     : ${JSON.stringify(i.remarksBackfilledFromBiostar)}`,
    );
  }
  console.log(`\n  written: ${file}`);
}

// --------------------------------------------------------------- observe

async function observe(label: string): Promise<void> {
  banner(`OBSERVE — ${label}`);

  const pool = await openSource();
  const src = await sourceRows(pool, true);
  await pool.close();

  const pg = await openPostgres();
  const students = await pg.query(
    `SELECT ${STUDENT_COLUMNS}, ("Photo" IS NOT NULL) AS has_photo
     FROM students WHERE "ID_Number" LIKE $1 ORDER BY "ID_Number"`,
    [SEED_LIKE],
  );
  const unchecked = await pg.query(
    'SELECT "ID_Number" FROM students WHERE remarks_checked_at IS NULL ORDER BY 1',
  );
  const pending = await pg.query(
    'SELECT "ID_Number", "Remarks" FROM students WHERE remarks_clear_pending IS TRUE ORDER BY 1',
  );
  await pg.end();

  const bs = await openBiostar();
  const list = await listBiostarUsers(bs);
  const seeded = list.filter((u) => String(u.user_id).startsWith(SEED_PREFIX));
  const details: Record<string, unknown> = {};
  for (const u of seeded) {
    const id = String(u.user_id);
    const d = await getBiostarUser(bs, id);
    if (d && typeof d.photo === 'string') d.photo = `<${d.photo.length} chars>`;
    details[id] = d;
  }

  const file = writeSnapshot(`observe-${label}`, {
    label,
    observedAt: new Date().toISOString(),
    source: src,
    postgres: {
      seededStudents: students.rows,
      uncheckedRemarks: unchecked.rows.map((r) => r.ID_Number),
      pendingClears: pending.rows,
    },
    biostar: { seededCount: seeded.length, list: seeded, details },
  });

  console.log(`source seeded rows   : ${src.length}`);
  console.log(`postgres seeded rows : ${students.rowCount}`);
  console.log(`biostar seeded users : ${seeded.length}`);
  console.log(`remarks_checked_at IS NULL : ${unchecked.rowCount}`);
  console.log(`remarks_clear_pending TRUE : ${pending.rowCount}`);
  console.log(`\nwritten: ${file}`);
}

// --------------------------------------------------------------- restore

async function restore(): Promise<void> {
  banner('RESTORE — removing every seeded row from all three systems');

  const pool = await openSource();
  const del = await pool
    .request()
    .input('p', sql.VarChar(100), SEED_LIKE)
    .query(`DELETE FROM ${SOURCE_TABLE} WHERE ID LIKE @p`);
  console.log(`  MSSQL   : deleted ${del.rowsAffected[0]} seeded row(s)`);
  const left = await sourceRows(pool);
  console.log(`  MSSQL   : ${left.length} row(s) remain`);
  await pool.close();

  const bs = await openBiostar();
  const list = await listBiostarUsers(bs);
  const seededIds = list
    .map((u) => String(u.user_id))
    .filter((id) => id.startsWith(SEED_PREFIX));
  if (seededIds.length > 0) {
    const res = await deleteBiostarUsers(bs, seededIds);
    console.log(
      `  BioStar : deleted ${seededIds.length} seeded user(s), status ${res.status}`,
    );
  } else {
    console.log('  BioStar : nothing seeded to delete');
  }

  const pg = await openPostgres();
  const pgDel = await pg.query(
    'DELETE FROM students WHERE "ID_Number" LIKE $1',
    [SEED_LIKE],
  );
  console.log(`  Postgres: deleted ${pgDel.rowCount} seeded student(s)`);
  const remaining = await pg.query('SELECT count(*)::int AS n FROM students');
  console.log(`  Postgres: ${remaining.rows[0].n} student(s) remain`);
  await pg.end();
}

// ------------------------------------------------------------------ main

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case 'baseline':
      return baseline();
    case 'seed':
      return seed();
    case 'seed-pg-states':
      return seedPgStates();
    case 'mutate':
      return mutate();
    case 'sync':
      if (!arg) throw new Error('sync needs a label, e.g. `sync red-a`');
      return syncCycle(arg);
    case 'observe':
      if (!arg)
        throw new Error('observe needs a label, e.g. `observe red-run-a`');
      return observe(arg);
    case 'restore':
      return restore();
    default:
      console.error(
        'usage: run.ts baseline | seed | seed-pg-states | mutate | sync <label> | observe <label> | restore',
      );
      process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[scenario] Fatal:', err?.message ?? err);
    if (err?.response?.data) console.error(JSON.stringify(err.response.data));
    process.exit(1);
  });
