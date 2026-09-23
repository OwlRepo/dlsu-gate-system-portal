/**
 * campaign.ts — the 2026-09-23 verification campaign against a clean sandbox.
 *
 * The harness next door (`run.ts`) cannot be used: it is hardcoded to
 * `dbo.TestTable` (`lib.ts:52`) and the `999000` id prefix (`scenarios.ts:15`),
 * and the sandbox now exposes `Gates.dbo.Entrant` instead. Everything else
 * about its approach is kept — baseline first, our rows identified by a prefix,
 * syncs driven through the running backend's HTTP API so `studentMutationLock`
 * still applies (`core/safety.md` invariant 1).
 *
 * One rule this script enforces on itself: it NEVER issues a DELETE against
 * SQL Server or BioStar. Their teammate is keeping whatever we leave behind,
 * and a previous test-server incident is exactly why every remote write is
 * appended to `logs/scenario/write-log.jsonl` before it is attempted.
 *
 *   bun --cwd apps/backend scripts/scenario/campaign.ts baseline
 *   bun --cwd apps/backend scripts/scenario/campaign.ts clear-pg
 *   bun --cwd apps/backend scripts/scenario/campaign.ts seed
 *   bun --cwd apps/backend scripts/scenario/campaign.ts state
 *
 * 20k stress round (see each command's comment):
 *   stress-preflight | stress-seed | stress-photos <jpeg> | stress-watch <queue|pull>
 *   stress-check | stress-mutate | stress-clear-hashes | stress-force-deep | stress-report
 */

import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as https from 'https';
import axios from 'axios';
import * as sql from 'mssql';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export const SEED_PREFIX = '91';
export const SOURCE_TABLE = 'dbo.Entrant';
const SNAPSHOT_DIR = path.resolve(__dirname, '../../logs/scenario');
const WRITE_LOG = path.join(SNAPSHOT_DIR, 'write-log.jsonl');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ---------------------------------------------------------------------------
// audit trail
// ---------------------------------------------------------------------------

/**
 * Records a remote write BEFORE it is attempted.
 *
 * Written first on purpose: a crash midway through still leaves the intent on
 * disk, which is what makes "what did you touch" answerable precisely when
 * something has gone wrong.
 */
function logWrite(system: string, op: string, ids: string[], note?: string) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    system,
    op,
    count: ids.length,
    ids: ids.slice(0, 200),
    ...(note ? { note } : {}),
  });
  fs.appendFileSync(WRITE_LOG, line + '\n');
  console.log(`  [write-log] ${system} ${op} ${ids.length} id(s)`);
}

function snapshot(name: string, payload: unknown): string {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const file = path.join(SNAPSHOT_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

// ---------------------------------------------------------------------------
// connections
// ---------------------------------------------------------------------------

async function openSource(): Promise<sql.ConnectionPool> {
  return sql.connect({
    user: process.env.SOURCE_DB_USERNAME,
    password: process.env.SOURCE_DB_PASSWORD,
    database: process.env.SOURCE_DB_NAME,
    server: process.env.SOURCE_DB_HOST!,
    port: Number(process.env.SOURCE_DB_PORT ?? 1433),
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 30000,
      requestTimeout: 120000,
    },
  } as sql.config);
}

async function openPostgres(): Promise<Client> {
  const c = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5433),
    user: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'dlsu_gate_system',
  });
  await c.connect();
  return c;
}

async function openBiostar(): Promise<{
  base: string;
  headers: Record<string, string>;
}> {
  const base = process.env.BIOSTAR_API_BASE_URL!;
  const res = await axios.post(
    `${base}/api/login`,
    {
      User: {
        login_id: process.env.BIOSTAR_API_LOGIN_ID,
        password: process.env.BIOSTAR_API_PASSWORD,
      },
    },
    {
      headers: { 'Content-Type': 'application/json' },
      httpsAgent,
      timeout: 120000,
    },
  );
  const sessionId = res.headers['bs-session-id'];
  if (!sessionId) throw new Error('BioStar login returned no bs-session-id');
  const token = String(res.data?.token ?? '').replace(/^Bearer\s+/i, '');
  return {
    base,
    headers: {
      Authorization: `Bearer ${token}`,
      'bs-session-id': sessionId,
      accept: 'application/json',
    },
  };
}

async function listBiostar(bs: {
  base: string;
  headers: Record<string, string>;
}) {
  const r = await axios.get(`${bs.base}/api/users`, {
    params: { limit: 500, offset: 0, order_by: 'name:true' },
    headers: bs.headers,
    httpsAgent,
    timeout: 90000,
  });
  return (r.data?.UserCollection?.rows ?? []) as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

async function baseline(): Promise<void> {
  console.log('BASELINE — read-only snapshot of all three systems\n');

  const pool = await openSource();
  const rows = await pool
    .request()
    .query(`SELECT * FROM ${SOURCE_TABLE} ORDER BY ID`);
  await pool.close();
  console.log(
    `  SQL Server : ${rows.recordset.length} row(s) in ${SOURCE_TABLE}`,
  );

  const pg = await openPostgres();
  const students = await pg.query(
    `SELECT "ID_Number", "Name", "Unique_ID", "Campus_Entry", "Remarks", "isArchived",
            ("Photo" IS NOT NULL) AS has_photo, "biostar_row_hash", "remarks_checked_at"
       FROM students ORDER BY "ID_Number"`,
  );
  const syncState = await pg.query('SELECT * FROM biostar_sync_state');
  await pg.end();
  console.log(`  PostgreSQL : ${students.rowCount} student(s)`);

  const bs = await openBiostar();
  const list = await listBiostar(bs);
  const details: Record<string, unknown> = {};
  for (const u of list) {
    const id = String(u.user_id);
    const d = await axios.get(`${bs.base}/api/users/${id}`, {
      headers: bs.headers,
      httpsAgent,
      timeout: 40000,
      validateStatus: () => true,
    });
    const user = (d.data?.User ?? d.data) as Record<string, unknown>;
    // Photos are megabytes of base64 and are not what a snapshot is for.
    if (user && typeof user.photo === 'string') {
      user.photo = `<${(user.photo as string).length} chars>`;
    }
    details[id] = user;
  }
  console.log(`  BioStar    : ${list.length} user(s)`);

  const file = snapshot('campaign-baseline', {
    capturedAt: new Date().toISOString(),
    source: {
      table: SOURCE_TABLE,
      count: rows.recordset.length,
      rows: rows.recordset,
    },
    postgres: {
      count: students.rowCount,
      students: students.rows,
      syncState: syncState.rows,
    },
    biostar: { count: list.length, list, details },
  });
  console.log(`\n  written: ${file}`);
}

async function clearPg(): Promise<void> {
  console.log('CLEAR-PG — local PostgreSQL only; nothing remote is touched\n');
  const pg = await openPostgres();
  const before = await pg.query('SELECT count(*)::int AS n FROM students');
  logWrite(
    'postgres',
    'truncate',
    [],
    `students had ${before.rows[0].n} row(s)`,
  );
  await pg.query('TRUNCATE TABLE students');
  await pg.query('TRUNCATE TABLE biostar_sync_state');
  const after = await pg.query('SELECT count(*)::int AS n FROM students');
  await pg.end();
  console.log(`  students: ${before.rows[0].n} -> ${after.rows[0].n}`);
  console.log('  biostar_sync_state: cleared');
}

type Row = {
  ID: string;
  LastName: string;
  FirstName: string;
  MiddleName: string | null;
  Suffix: string | null;
  Group: string | null;
  Status: boolean;
  Remarks: string | null;
  IsArchived: boolean;
};
const row = (ID: string, over: Partial<Row> = {}): Row => ({
  ID,
  LastName: 'Santos',
  FirstName: 'Juan',
  MiddleName: null,
  Suffix: null,
  Group: 'Student',
  Status: true,
  Remarks: null,
  IsArchived: false,
  ...over,
});

/** Every row exists to prove exactly one case in the approved plan. */
export function campaignRows(): Row[] {
  const scenarios: Row[] = [
    row('91000001'), //                                                   B11, D1, E1-E3, F4
    row('91000002', { Remarks: 'Watchlist' }), //                         F1, D3
    row('91000003', { Remarks: '   ' }), //                               B7, E4, E6
    row('91000004', { Remarks: 'late, "again"' }), //                     B6
    row('91000005', { Status: false }), //                                B4, F2
    row('91000006', { IsArchived: true }), //                             B3
    row('91000007', {
      LastName: 'Pena-Cruz',
      FirstName: "O'Brien",
      Suffix: 'Jr.',
    }), // B8
    row('91000008', { LastName: '', FirstName: '' }), //                  B1
    row('91000009', { Group: 'Contractor' }), //                          group fallback
    row('91000010', { Remarks: 'X'.repeat(50) }), //                      column max
    row('91000011'), //                                                   B2, first copy
    row('91000011', { FirstName: 'Duplicate' }), //                       B2, last copy wins
    row('91000012'), //                                                   F3
    row('91000013', { Status: false, Remarks: 'Not Enrolled' }), //       B5
    row('91000014', {
      LastName: 'Dela Cruz',
      FirstName: 'Maria Rachel',
      MiddleName: 'NULL',
      Suffix: 'NULL',
    }), //                                                                A1
    row('91000015', { MiddleName: 'N/A' }), //                            A2
    row('91000016', {
      LastName: 'NULL',
      FirstName: 'Ana',
      MiddleName: 'Reyes',
    }), // A3
    row('91000017', { LastName: 'NULL', FirstName: 'NULL' }), //          A4 fallback
    row('91000018', { MiddleName: '-', Suffix: '.' }), //                 A5
    row('91000019', { LastName: '  Padded  ', FirstName: '  Name  ' }), // B9
    row('91000020', { LastName: 'L'.repeat(50), FirstName: 'F'.repeat(50) }), // B10
    row('91000021', { MiddleName: 'Nullova', Suffix: 'Nonesuch' }), //    A6
  ];

  const LAST = ['Santos', 'Reyes', 'Cruz', 'Garcia', 'Dela Cruz'];
  const FIRST = ['Juan', 'Maria', 'Jose', 'Ana', 'Michael'];
  const GROUPS = ['Student', 'Employee', 'Faculty', 'Staff', 'Visitor'];
  const plain: Row[] = Array.from({ length: 30 }, (_, i) => {
    const n = i + 1;
    return row(`9100${String(100 + n).padStart(4, '0')}`, {
      LastName: LAST[n % LAST.length],
      FirstName: FIRST[(n * 3) % FIRST.length],
      Group: GROUPS[n % GROUPS.length],
    });
  });

  return [...scenarios, ...plain];
}

async function seed(): Promise<void> {
  console.log('SEED — inserting campaign rows into the sandbox source\n');
  const pool = await openSource();

  const existing = await pool
    .request()
    .input('p', sql.NVarChar(50), `${SEED_PREFIX}%`)
    .query(`SELECT COUNT(*) AS n FROM ${SOURCE_TABLE} WHERE ID LIKE @p`);
  if (existing.recordset[0].n > 0) {
    console.error(
      `ABORT: ${existing.recordset[0].n} row(s) with the ${SEED_PREFIX} prefix already exist. ` +
        'Seeding twice would double the duplicate-ID case.',
    );
    await pool.close();
    process.exit(1);
  }

  const rows = campaignRows();
  logWrite(
    'mssql',
    'insert',
    rows.map((r) => r.ID),
    `into ${SOURCE_TABLE}`,
  );

  const table = new sql.Table(SOURCE_TABLE);
  table.create = false;
  table.columns.add('ID', sql.NVarChar(50), { nullable: true });
  table.columns.add('LastName', sql.NVarChar(50), { nullable: true });
  table.columns.add('FirstName', sql.NVarChar(50), { nullable: true });
  table.columns.add('MiddleName', sql.NVarChar(50), { nullable: true });
  table.columns.add('Suffix', sql.NVarChar(50), { nullable: true });
  table.columns.add('Group', sql.NVarChar(50), { nullable: true });
  table.columns.add('Status', sql.Bit, { nullable: true });
  table.columns.add('Remarks', sql.NVarChar(50), { nullable: true });
  table.columns.add('IsArchived', sql.Bit, { nullable: true });
  for (const r of rows) {
    table.rows.add(
      r.ID,
      r.LastName,
      r.FirstName,
      r.MiddleName,
      r.Suffix,
      r.Group,
      r.Status,
      r.Remarks,
      r.IsArchived,
    );
  }
  const res = await pool.request().bulk(table);
  console.log(`  inserted ${res.rowsAffected} row(s)`);

  const after = await pool.request().query(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN ID LIKE '${SEED_PREFIX}%' THEN 1 ELSE 0 END) AS ours
    FROM ${SOURCE_TABLE}`);
  console.log(
    `  ${SOURCE_TABLE}: total=${after.recordset[0].total} ours=${after.recordset[0].ours}`,
  );
  await pool.close();
}

async function state(): Promise<void> {
  const pool = await openSource();
  const src = await pool.request().query(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN ID LIKE '${SEED_PREFIX}%' THEN 1 ELSE 0 END) AS ours
    FROM ${SOURCE_TABLE}`);
  await pool.close();

  const pg = await openPostgres();
  const st = await pg.query(
    `SELECT count(*)::int AS total, count("Photo")::int AS with_photo,
            count("Unique_ID")::int AS with_card FROM students`,
  );
  await pg.end();

  const bs = await openBiostar();
  const list = await listBiostar(bs);

  console.log(
    `SQL Server ${SOURCE_TABLE}: total=${src.recordset[0].total} ours=${src.recordset[0].ours ?? 0}`,
  );
  console.log(`PostgreSQL students     : ${JSON.stringify(st.rows[0])}`);
  console.log(`BioStar users           : ${list.length}`);
}

/**
 * Inserts rows into the source, refusing if any of their ids already exists.
 * Insert-only by construction: nothing here can overwrite a row.
 */
async function insertRows(rows: Row[], label: string): Promise<void> {
  const pool = await openSource();
  const ids = [...new Set(rows.map((r) => r.ID))];
  const req = pool.request();
  ids.forEach((id, i) => req.input(`id${i}`, sql.NVarChar(50), id));
  const existing = await req.query(
    `SELECT ID FROM ${SOURCE_TABLE} WHERE ID IN (${ids.map((_, i) => `@id${i}`).join(', ')})`,
  );
  if (existing.recordset.length > 0) {
    console.error(
      `ABORT: already present: ${existing.recordset.map((r) => r.ID).join(', ')}`,
    );
    await pool.close();
    process.exit(1);
  }
  logWrite('mssql', 'insert', ids, `${label} into ${SOURCE_TABLE}`);
  const table = new sql.Table(SOURCE_TABLE);
  table.create = false;
  table.columns.add('ID', sql.NVarChar(50), { nullable: true });
  table.columns.add('LastName', sql.NVarChar(50), { nullable: true });
  table.columns.add('FirstName', sql.NVarChar(50), { nullable: true });
  table.columns.add('MiddleName', sql.NVarChar(50), { nullable: true });
  table.columns.add('Suffix', sql.NVarChar(50), { nullable: true });
  table.columns.add('Group', sql.NVarChar(50), { nullable: true });
  table.columns.add('Status', sql.Bit, { nullable: true });
  table.columns.add('Remarks', sql.NVarChar(50), { nullable: true });
  table.columns.add('IsArchived', sql.Bit, { nullable: true });
  for (const r of rows) {
    table.rows.add(
      r.ID,
      r.LastName,
      r.FirstName,
      r.MiddleName,
      r.Suffix,
      r.Group,
      r.Status,
      r.Remarks,
      r.IsArchived,
    );
  }
  const res = await pool.request().bulk(table);
  console.log(`  inserted ${res.rowsAffected} row(s): ${ids.join(', ')}`);
  await pool.close();
}

/** Step 1 of the 2026-09-23 plan: the RCA subject, starting inactive. */
async function seedExtra(): Promise<void> {
  console.log('SEED-EXTRA — RCA subject\n');
  await insertRows(
    [
      row('91000030', {
        LastName: 'Rca',
        FirstName: 'Reactivated',
        Status: false,
      }),
    ],
    'rca subject',
  );
}

/**
 * Step 1: reactivate the RCA subject with a name BioStar will reject, to test
 * whether a rejected row leaves an active person expired in BioStar.
 */
async function rcaReactivate(): Promise<void> {
  console.log('RCA-REACTIVATE — 91000030 active, name over 48 characters\n');
  const pool = await openSource();
  logWrite('mssql', 'update', ['91000030'], 'Status=1, 30xA / 30xB name');
  const res = await pool
    .request()
    .query(
      `UPDATE ${SOURCE_TABLE} SET Status = 1, LastName = REPLICATE('A', 30), FirstName = REPLICATE('B', 30) WHERE ID = '91000030'`,
    );
  console.log(`  rows updated: ${res.rowsAffected[0]}`);
  await pool.close();
}

/** Read-only evidence for checks 1a, 1b and 1c. */
async function rcaCheck(): Promise<void> {
  const bs = await openBiostar();
  const d = await axios.get(`${bs.base}/api/users/91000030`, {
    headers: bs.headers,
    httpsAgent,
    timeout: 40000,
    validateStatus: () => true,
  });
  const u = (d.data?.User ?? d.data) as Record<string, unknown>;
  console.log(
    `BioStar 91000030 : status=${d.status} expired=${JSON.stringify(u?.expired)} name=${JSON.stringify(u?.name)} start=${u?.start_datetime} expiry=${u?.expiry_datetime}`,
  );

  const pg = await openPostgres();
  const s = await pg.query(
    `SELECT "Campus_Entry", "isArchived", "Name" FROM students WHERE "ID_Number" = '91000030'`,
  );
  console.log(`PostgreSQL 91000030: ${JSON.stringify(s.rows[0] ?? null)}`);

  const diagDir = path.resolve(__dirname, '../../logs/diagnostics');
  // By modification time: a name sort puts manual-9 after manual-22.
  const diag = fs
    .readdirSync(diagDir)
    .filter((f) => f.startsWith('diag_manual-'))
    .map((f) => ({ f, t: fs.statSync(path.join(diagDir, f)).mtimeMs }))
    .sort((a, b) => a.t - b.t)
    .pop()?.f;
  if (diag) {
    const p = JSON.parse(fs.readFileSync(path.join(diagDir, diag), 'utf8'));
    console.log(`newest ${diag}: csvImport=${JSON.stringify(p.csvImport)}`);
  }

  const errDir = path.resolve(__dirname, '../../logs/skipped-records');
  const errFile = fs
    .readdirSync(errDir)
    .filter((f) => f.startsWith('error_details_batch_manual-'))
    .map((f) => ({ f, t: fs.statSync(path.join(errDir, f)).mtimeMs }))
    .sort((a, b) => a.t - b.t)
    .pop()?.f;
  if (errFile) {
    const lines = fs
      .readFileSync(path.join(errDir, errFile), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.startsWith('91000030,'));
    console.log(`newest ${errFile}: lines for 91000030 = ${lines.length}`);
    for (const l of lines) console.log(`   ${l.slice(-140)}`);
  }

  // 1c: inactive but not archived — "confirmed" to a reader of isArchived only.
  const inactive = await pg.query(
    `SELECT "ID_Number" FROM students
      WHERE "ID_Number" LIKE '91%' AND "Campus_Entry" = 'N' AND "isArchived" = false
      ORDER BY 1`,
  );
  await pg.end();
  const list = await listBiostar(bs);
  const byId = new Map(list.map((x) => [String(x.user_id), x]));
  console.log(`1c inactive-but-not-archived: ${inactive.rowCount}`);
  for (const r of inactive.rows) {
    const b = byId.get(r.ID_Number);
    console.log(
      `   ${r.ID_Number} BioStar expired=${JSON.stringify(b?.expired)}`,
    );
  }
}

/** Step 7: the 48-character boundary, and a row that may force a live partial. */
async function seedBoundary(): Promise<void> {
  console.log('SEED-BOUNDARY — name-length edge and a non-numeric id\n');
  await insertRows(
    [
      row('91000031', { LastName: 'A'.repeat(23), FirstName: 'B'.repeat(24) }),
      row('91000032', { LastName: 'A'.repeat(24), FirstName: 'B'.repeat(24) }),
      row('9100ABC1', { LastName: 'Santos', FirstName: 'Juan' }),
    ],
    'boundary',
  );
}

/** The newest file in a log directory whose name starts with `prefix`. */
function newestLog(dir: string, prefix: string): string | null {
  const full = path.resolve(__dirname, '../../logs', dir);
  const hit = fs
    .readdirSync(full)
    .filter((f) => f.startsWith(prefix))
    .map((f) => ({ f, t: fs.statSync(path.join(full, f)).mtimeMs }))
    .sort((a, b) => a.t - b.t)
    .pop()?.f;
  return hit ? path.join(full, hit) : null;
}

/** Read-only evidence for Step 7. */
async function check7(): Promise<void> {
  const diagPath = newestLog('diagnostics', 'diag_manual-');
  if (diagPath) {
    const d = JSON.parse(fs.readFileSync(diagPath, 'utf8'));
    const x = d.csvExport ?? {};
    console.log(`diag: ${path.basename(diagPath)}`);
    console.log(
      `  7-0 new build (key present): ${'nameTruncatedForBiostar' in x}`,
    );
    console.log(`  rowsEmitted            : ${x.rowsEmitted}`);
    console.log(
      `  nameTruncatedForBiostar: ${JSON.stringify(x.nameTruncatedForBiostar?.ids)}`,
    );
    console.log(
      `  rowsRejectedByBiostar  : ${JSON.stringify(x.rowsRejectedByBiostar?.ids)}`,
    );
    console.log(
      `  partialImportUnparsed  : ${JSON.stringify(x.partialImportUnparsed)}`,
    );
    console.log(`  csvImport              : ${JSON.stringify(d.csvImport)}`);
  }
  const bs = await openBiostar();
  for (const id of [
    '91000020',
    '91000031',
    '91000032',
    '91000030',
    '9100ABC1',
  ]) {
    const r = await axios.get(`${bs.base}/api/users/${id}`, {
      headers: bs.headers,
      httpsAgent,
      timeout: 40000,
      validateStatus: () => true,
    });
    const u = (r.data?.User ?? r.data) as Record<string, unknown>;
    const name = String(u?.name ?? '');
    console.log(
      `  BioStar ${id}: status=${r.status} expired=${JSON.stringify(u?.expired)} nameLen=${name.length} name=${JSON.stringify(name)}`,
    );
  }
}

/**
 * Step 8: the four source changes. The DELETE is the only one in the campaign
 * and touches one of our own rows by exact id — it is what reconciliation
 * needs to see to archive a person who left the source.
 */
async function mutate(): Promise<void> {
  console.log('MUTATE — F1..F4\n');
  const pool = await openSource();
  const steps: Array<[string, string, string]> = [
    [
      'update',
      '91000002',
      `UPDATE ${SOURCE_TABLE} SET Remarks = NULL WHERE ID = '91000002'`,
    ],
    [
      'update',
      '91000005',
      `UPDATE ${SOURCE_TABLE} SET Status = 1 WHERE ID = '91000005'`,
    ],
    ['delete', '91000012', `DELETE FROM ${SOURCE_TABLE} WHERE ID = '91000012'`],
    [
      'update',
      '91000001',
      `UPDATE ${SOURCE_TABLE} SET LastName = 'Changed' WHERE ID = '91000001'`,
    ],
  ];
  for (const [op, id, text] of steps) {
    logWrite('mssql', op, [id], text);
    const res = await pool.request().query(text);
    console.log(`  ${op} ${id}: ${res.rowsAffected[0]} row(s)`);
  }
  await pool.close();
}

/** Read-only evidence for Step 8's F cases. */
async function check8(): Promise<void> {
  const diagPath = newestLog('diagnostics', 'diag_manual-');
  if (diagPath) {
    const d = JSON.parse(fs.readFileSync(diagPath, 'utf8'));
    console.log(`diag: ${path.basename(diagPath)}`);
    console.log(`  F4 rowsEmitted          : ${d.csvExport?.rowsEmitted}`);
    console.log(
      `  F1 remarks.clearedInPostgres: ${JSON.stringify(d.remarks?.clearedInPostgres?.ids)}`,
    );
    console.log(
      `  F3 archivedByReconciliation : ${JSON.stringify(d.archivedByReconciliation)}`,
    );
  }
  const bs = await openBiostar();
  const get = async (id: string) => {
    const r = await axios.get(`${bs.base}/api/users/${id}`, {
      headers: bs.headers,
      httpsAgent,
      timeout: 40000,
      validateStatus: () => true,
    });
    return (r.data?.User ?? r.data) as Record<string, any>;
  };
  const u2 = await get('91000002');
  const f = (u2?.user_custom_fields ?? []).find(
    (x: any) => x?.custom_field?.name === 'Remarks',
  );
  console.log(
    `  F1 BioStar 91000002 Remarks item: ${JSON.stringify(f ? (f.item ?? '(no item key)') : '(no field)')}`,
  );
  const u5 = await get('91000005');
  console.log(`  F2 BioStar 91000005 expired: ${JSON.stringify(u5?.expired)}`);
  const pg = await openPostgres();
  const s = await pg.query(
    `SELECT "ID_Number", "isArchived" FROM students WHERE "ID_Number" = '91000012'`,
  );
  await pg.end();
  console.log(`  F3 PostgreSQL 91000012: ${JSON.stringify(s.rows[0] ?? null)}`);
}

// ---------------------------------------------------------------------------
// 20k stress round
// ---------------------------------------------------------------------------

export const STRESS_PREFIX = '912';
export const STRESS_COUNT = 20000;
export const stressId = (i: number) =>
  `${STRESS_PREFIX}${String(i).padStart(5, '0')}`;
const STRESS_STATE = path.join(SNAPSHOT_DIR, 'stress-preflight.json');

/**
 * Each rule is a residue class that no other rule shares, so every expected
 * count below is plain arithmetic and never a guess.
 */
export function stressRows(): Row[] {
  const LAST = [
    'Santos',
    'Reyes',
    'Cruz',
    'Garcia',
    'Mendoza',
    'Torres',
    'Flores',
    'Ramos',
    'Aquino',
    'Bautista',
  ];
  const FIRST = [
    'Juan',
    'Maria',
    'Jose',
    'Ana',
    'Michael',
    'Angela',
    'Mark',
    'Kristine',
    'John',
    'Patricia',
  ];
  const GROUPS = ['Student', 'Employee', 'Faculty', 'Staff'];
  return Array.from({ length: STRESS_COUNT }, (_, i) =>
    row(stressId(i), {
      LastName: i % 100 === 7 ? 'L'.repeat(30) : LAST[i % 10], //    200 long names
      FirstName:
        i % 100 === 7 ? 'F'.repeat(30) : FIRST[Math.floor(i / 10) % 10],
      Group: GROUPS[i % 4],
      Status: i % 10 !== 5, //                                         2,000 inactive
      Remarks: i % 20 === 3 ? 'Stress remark' : null, //                1,000 remarks
      IsArchived: i % 50 === 0, //                                        400 archived
    }),
  );
}
export const STRESS_EXPECT = {
  total: 20000,
  archived: 400,
  inBiostar: 19600,
  inactive: 2000,
  longNames: 200,
  remarks: 1000,
};
/** 100 active, short-named, remark-free rows: i % 200 === 11. */
export const STRESS_MUTATE_IDS = Array.from(
  { length: STRESS_COUNT },
  (_, i) => i,
)
  .filter((i) => i % 200 === 11)
  .map(stressId);
const REMARK_SAMPLE = [3, 23, 43, 63, 83].map(stressId);

function stressTable(rows: Row[]): sql.Table {
  const table = new sql.Table(SOURCE_TABLE);
  table.create = false;
  table.columns.add('ID', sql.NVarChar(50), { nullable: true });
  table.columns.add('LastName', sql.NVarChar(50), { nullable: true });
  table.columns.add('FirstName', sql.NVarChar(50), { nullable: true });
  table.columns.add('MiddleName', sql.NVarChar(50), { nullable: true });
  table.columns.add('Suffix', sql.NVarChar(50), { nullable: true });
  table.columns.add('Group', sql.NVarChar(50), { nullable: true });
  table.columns.add('Status', sql.Bit, { nullable: true });
  table.columns.add('Remarks', sql.NVarChar(50), { nullable: true });
  table.columns.add('IsArchived', sql.Bit, { nullable: true });
  for (const r of rows) {
    table.rows.add(
      r.ID,
      r.LastName,
      r.FirstName,
      r.MiddleName,
      r.Suffix,
      r.Group,
      r.Status,
      r.Remarks,
      r.IsArchived,
    );
  }
  return table;
}

async function listAllBiostar(bs: {
  base: string;
  headers: Record<string, string>;
}) {
  const out: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await axios.get(`${bs.base}/api/users`, {
      params: { limit: 500, offset, order_by: 'name:true' },
      headers: bs.headers,
      httpsAgent,
      timeout: 120000,
    });
    const rows = (r.data?.UserCollection?.rows ?? []) as Record<
      string,
      unknown
    >[];
    out.push(...rows);
    const total = Number(r.data?.UserCollection?.total ?? 0);
    if (rows.length === 0 || offset + 500 >= total) break;
  }
  return out;
}

/** Read-only. Proves the 912 range is empty everywhere; records where we start. */
async function stressPreflight(): Promise<void> {
  const pool = await openSource();
  const src = await pool
    .request()
    .query(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN ID LIKE '${STRESS_PREFIX}%' THEN 1 ELSE 0 END) AS stress FROM ${SOURCE_TABLE}`,
    );
  await pool.close();
  const pg = await openPostgres();
  const st = await pg.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE "ID_Number" LIKE '${STRESS_PREFIX}%')::int AS stress FROM students`,
  );
  await pg.end();
  const list = await listAllBiostar(await openBiostar());
  const facts = {
    capturedAt: new Date().toISOString(),
    sourceTotal: src.recordset[0].total,
    sourceStress: src.recordset[0].stress ?? 0,
    postgresTotal: st.rows[0].total,
    postgresStress: st.rows[0].stress,
    biostarTotal: list.length,
    biostarStress: list.filter((u) =>
      String(u.user_id).startsWith(STRESS_PREFIX),
    ).length,
  };
  for (const [k, v] of Object.entries(facts))
    console.log(`${k}=${JSON.stringify(v)}`);
  if (facts.sourceStress || facts.postgresStress || facts.biostarStress) {
    console.error('ABORT: the 912 range is not empty');
    process.exit(1);
  }
  fs.writeFileSync(STRESS_STATE, JSON.stringify(facts, null, 2));
}

async function stressSeed(): Promise<void> {
  const rows = stressRows();
  const n = (f: (r: Row) => boolean) => rows.filter(f).length;
  const got = {
    total: rows.length,
    archived: n((r) => r.IsArchived),
    inBiostar: n((r) => !r.IsArchived),
    inactive: n((r) => !r.Status),
    longNames: n((r) => r.LastName.length === 30),
    remarks: n((r) => r.Remarks !== null),
  };
  if (JSON.stringify(got) !== JSON.stringify(STRESS_EXPECT)) {
    console.error(`ABORT: generator drifted: ${JSON.stringify(got)}`);
    process.exit(1);
  }
  const pool = await openSource();
  const existing = await pool
    .request()
    .input('p', sql.NVarChar(50), `${STRESS_PREFIX}%`)
    .query(`SELECT COUNT(*) AS n FROM ${SOURCE_TABLE} WHERE ID LIKE @p`);
  if (existing.recordset[0].n > 0) {
    console.error(
      `ABORT: ${existing.recordset[0].n} row(s) in the ${STRESS_PREFIX} range already exist`,
    );
    await pool.close();
    process.exit(1);
  }
  const CHUNK = 2000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    logWrite(
      'mssql',
      'insert',
      chunk.map((r) => r.ID),
      `stress ${chunk[0].ID}..${chunk[chunk.length - 1].ID} into ${SOURCE_TABLE}`,
    );
    const res = await pool.request().bulk(stressTable(chunk));
    console.log(
      `  inserted ${res.rowsAffected} (${chunk[0].ID}..${chunk[chunk.length - 1].ID})`,
    );
  }
  const after = await pool
    .request()
    .input('p', sql.NVarChar(50), `${STRESS_PREFIX}%`)
    .query(`SELECT COUNT(*) AS n FROM ${SOURCE_TABLE} WHERE ID LIKE @p`);
  console.log(`stressRowsInSource=${after.recordset[0].n}`);
  await pool.close();
}

/**
 * Gives every 912 user in BioStar the same profile photo. Resumable: users that
 * already show photo_exists 'true' are skipped, so a rerun continues.
 */
async function stressPhotos(): Promise<void> {
  const file = process.argv[3];
  if (!file || !fs.existsSync(file)) {
    console.error('usage: campaign.ts stress-photos <jpeg-file>');
    process.exit(1);
  }
  const b64 = fs.readFileSync(file).toString('base64');
  const bs = await openBiostar();
  const all = await listAllBiostar(bs);
  const stress = all.filter((u) => String(u.user_id).startsWith(STRESS_PREFIX));
  const todo = stress
    .filter((u) => String(u.photo_exists) !== 'true')
    .map((u) => String(u.user_id))
    .sort();
  console.log(
    `photoChars=${b64.length} stressInBiostar=${stress.length} withoutPhoto=${todo.length}`,
  );
  const CHUNK = 200;
  const CONCURRENCY = 4;
  const t0 = Date.now();
  let done = 0;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const chunk = todo.slice(i, i + CHUNK);
    logWrite(
      'biostar',
      'put-photo',
      chunk,
      `stress photo, ${b64.length} chars`,
    );
    let failure: string | null = null;
    let next = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (failure === null && next < chunk.length) {
          const id = chunk[next++];
          const r = await axios.put(
            `${bs.base}/api/users/${id}`,
            { User: { photo: b64 } },
            {
              headers: { ...bs.headers, 'Content-Type': 'application/json' },
              httpsAgent,
              timeout: 60000,
              validateStatus: () => true,
            },
          );
          if (r.status !== 200) {
            failure = `${id}: HTTP ${r.status} ${JSON.stringify(r.data?.Response ?? r.data).slice(0, 200)}`;
          } else done++;
        }
      }),
    );
    if (failure) {
      console.error(`STOP: ${failure}`);
      process.exit(1);
    }
    console.log(
      `  ${done}/${todo.length} in ${Math.round((Date.now() - t0) / 1000)}s`,
    );
  }
}

/**
 * Waits for the NEXT sync to finish, sampling the backend's memory. Read-only.
 *   stress-watch queue — Run Full Sync (a sync_queue row)
 *   stress-watch pull  — Run Biostar Sync (no queue row; ends on a new diag file)
 */
async function stressWatch(): Promise<void> {
  const mode = process.argv[3];
  if (mode !== 'queue' && mode !== 'pull') {
    console.error('usage: campaign.ts stress-watch <queue|pull>');
    process.exit(1);
  }
  const { execSync } = await import('child_process');
  const port = process.env.PORT ?? '10580';
  const diagDir = path.resolve(__dirname, '../../logs/diagnostics');
  const pg = await openPostgres();
  const newestJob = async () =>
    (
      await pg.query(
        `SELECT id::text AS id, status, "createdAt", "completedAt" FROM sync_queue ORDER BY "createdAt" DESC LIMIT 1`,
      )
    ).rows[0];
  const lastError = async () =>
    (
      await pg.query(
        `SELECT "lastError" FROM biostar_sync_state WHERE "schemaKey" = 'dasma'`,
      )
    ).rows[0]?.lastError ?? null;
  const startJob = await newestJob();
  const startError = await lastError();
  const t0 = Date.now();
  let peakRssMb = 0;
  const finish = async (line: Record<string, unknown>, code: number) => {
    const out = {
      ts: new Date().toISOString(),
      mode,
      ...line,
      watchSeconds: Math.round((Date.now() - t0) / 1000),
      peakRssMb,
    };
    fs.appendFileSync(
      path.join(SNAPSHOT_DIR, 'stress-watch.jsonl'),
      JSON.stringify(out) + '\n',
    );
    console.log(
      Object.entries(out)
        .map(([k, v]) => `${k}=${v}`)
        .join(' '),
    );
    await pg.end();
    process.exit(code);
  };
  while (Date.now() - t0 < 3 * 60 * 60 * 1000) {
    try {
      const pid = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`)
        .toString()
        .trim()
        .split('\n')[0];
      const rss = Number(execSync(`ps -o rss= -p ${pid}`).toString().trim());
      peakRssMb = Math.max(peakRssMb, Math.round(rss / 1024));
    } catch {
      /* backend restarting; keep polling */
    }
    if (mode === 'queue') {
      const job = await newestJob();
      if (
        job &&
        job.id !== startJob?.id &&
        (job.status === 'completed' || job.status === 'failed')
      ) {
        const seconds = Math.round(
          (new Date(job.completedAt ?? Date.now()).getTime() -
            new Date(job.createdAt).getTime()) /
            1000,
        );
        await finish(
          { job: job.id, status: job.status, seconds },
          job.status === 'completed' ? 0 : 1,
        );
      }
    } else {
      const fresh = fs
        .readdirSync(diagDir)
        .filter(
          (f) =>
            f.startsWith('diag_biostar') &&
            fs.statSync(path.join(diagDir, f)).mtimeMs > t0,
        );
      if (fresh.length > 0)
        await finish({ file: fresh[0], status: 'completed' }, 0);
      const err = await lastError();
      if (err !== startError)
        await finish({ status: 'failed', lastError: err }, 1);
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  await finish({ status: 'STILL RUNNING after 3h' }, 2);
}

/** Read-only. Prints every fact the step tables compare against. */
async function stressCheck(): Promise<void> {
  const push = newestLog('diagnostics', 'diag_manual-');
  const pull = newestLog('diagnostics', 'diag_biostar');
  if (push) {
    const d = JSON.parse(fs.readFileSync(push, 'utf8'));
    const x = d.csvExport ?? {};
    const imports = (d.csvImport ?? []) as {
      batchNumber: number;
      outcome: string;
    }[];
    console.log(`push.file=${path.basename(push)}`);
    console.log(`push.rowsEmitted=${x.rowsEmitted}`);
    console.log(`push.rowsChanged=${d.rowsChanged}`);
    const emitted = [...(x.emittedIds?.ids ?? [])].sort();
    console.log(
      `push.emittedIdsCount=${emitted.length + (x.emittedIds?.truncated ?? 0)}`,
    );
    if (emitted.length <= 5)
      console.log(`push.emittedIds=${JSON.stringify(emitted)}`);
    const mutatedPlusAbc = [...STRESS_MUTATE_IDS, '9100ABC1'].sort();
    console.log(
      `push.emittedEqualsMutatedPlus9100ABC1=${JSON.stringify(emitted) === JSON.stringify(mutatedPlusAbc)}`,
    );
    console.log(`push.csvImport.length=${imports.length}`);
    console.log(
      `push.partialBatches=${JSON.stringify(imports.filter((b) => b.outcome === 'partial').map((b) => b.batchNumber))}`,
    );
    console.log(
      `push.otherThanSuccessOrPartial=${imports.filter((b) => b.outcome !== 'success' && b.outcome !== 'partial').length}`,
    );
    console.log(
      `push.rowsRejectedByBiostar=${JSON.stringify(x.rowsRejectedByBiostar?.ids)}`,
    );
    console.log(
      `push.partialImportUnparsed=${JSON.stringify(x.partialImportUnparsed)}`,
    );
    console.log(
      `push.nameTruncated=${(x.nameTruncatedForBiostar?.ids?.length ?? 0) + (x.nameTruncatedForBiostar?.truncated ?? 0)}`,
    );
    console.log(`push.sweptThisRun=${d.remarks?.sweptThisRun}`);
    console.log(`push.csnApiLookups=${x.csnApiLookups}`);
    console.log(`push.importMaxRows=${x.importMaxRows}`);
    console.log(
      `push.biostarUploadsHalted=${JSON.stringify(x.biostarUploadsHalted)}`,
    );
    console.log(`push.rowsDeferredAfterHalt=${x.rowsDeferredAfterHalt}`);
    const durations = (d.csvImport ?? []).map(
      (b: { durationMs?: number }) => b.durationMs ?? 0,
    );
    console.log(
      `push.importDurationMs=${JSON.stringify({
        count: durations.length,
        max: Math.max(0, ...durations),
        mean: durations.length
          ? Math.round(
              durations.reduce((a: number, b: number) => a + b, 0) /
                durations.length,
            )
          : 0,
      })}`,
    );
    console.log(`push.timingsMs=${JSON.stringify(d.timingsMs)}`);
  }
  if (pull) {
    const d = JSON.parse(fs.readFileSync(pull, 'utf8'));
    console.log(`pull.file=${path.basename(pull)}`);
    for (const k of [
      'deepPass',
      'reportedTotal',
      'candidatesAccepted',
      'detailFetched',
      'detailHadPhoto',
      'endedOnCap',
    ]) {
      console.log(`pull.${k}=${JSON.stringify(d[k])}`);
    }
    console.log(
      `pull.failedUserIds=${(d.failedUserIds?.ids?.length ?? 0) + (d.failedUserIds?.truncated ?? 0)}`,
    );
    console.log(
      `pull.missingFromPostgres=${JSON.stringify(d.missingFromPostgres?.ids)}`,
    );
    console.log(`pull.timingsMs=${JSON.stringify(d.timingsMs)}`);
  }
  const pg = await openPostgres();
  const s = await pg.query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE "isArchived")::int AS archived,
           count(*) FILTER (WHERE NOT "isArchived" AND "Photo" IS NOT NULL)::int AS active_with_photo,
           count(*) FILTER (WHERE "isArchived" AND "Photo" IS NOT NULL)::int AS archived_with_photo,
           count(*) FILTER (WHERE NOT "isArchived" AND "remarks_checked_at" IS NULL)::int AS active_unchecked,
           count(*) FILTER (WHERE NOT "isArchived" AND "biostar_row_hash" IS NULL)::int AS active_hash_missing
      FROM students WHERE "ID_Number" LIKE '${STRESS_PREFIX}%'`);
  await pg.end();
  for (const [k, v] of Object.entries(s.rows[0])) console.log(`pg.${k}=${v}`);
  const bs = await openBiostar();
  const list = (await listAllBiostar(bs)).filter((u) =>
    String(u.user_id).startsWith(STRESS_PREFIX),
  );
  console.log(`biostar.users=${list.length}`);
  console.log(
    `biostar.expired=${list.filter((u) => String(u.expired) === 'true').length}`,
  );
  console.log(
    `biostar.withPhoto=${list.filter((u) => String(u.photo_exists) === 'true').length}`,
  );
  console.log(
    `biostar.name48=${list.filter((u) => String(u.name ?? '').length === 48).length}`,
  );
  console.log(
    `biostar.nameMutated=${list.filter((u) => String(u.name ?? '').startsWith('Mutated')).length}`,
  );
  for (const id of REMARK_SAMPLE) {
    const r = await axios.get(`${bs.base}/api/users/${id}`, {
      headers: bs.headers,
      httpsAgent,
      timeout: 40000,
      validateStatus: () => true,
    });
    const u = (r.data?.User ?? r.data) as Record<string, any>;
    const f = (u?.user_custom_fields ?? []).find(
      (c: any) => c?.custom_field?.name === 'Remarks',
    );
    console.log(`biostar.remark.${id}=${JSON.stringify(f?.item ?? null)}`);
  }
}

async function stressMutate(): Promise<void> {
  const pool = await openSource();
  const text = `UPDATE ${SOURCE_TABLE} SET LastName = 'Mutated' WHERE ID IN (${STRESS_MUTATE_IDS.map((id) => `'${id}'`).join(', ')})`;
  logWrite('mssql', 'update', STRESS_MUTATE_IDS, "LastName = 'Mutated'");
  const res = await pool.request().query(text);
  console.log(`rowsUpdated=${res.rowsAffected[0]}`);
  await pool.close();
}

/** Local PostgreSQL only: makes the next Full Sync export every 912 row, as production's first run after deploy will. */
async function stressClearHashes(): Promise<void> {
  const pg = await openPostgres();
  logWrite(
    'postgres',
    'update',
    [],
    `biostar_row_hash = NULL for ${STRESS_PREFIX}%`,
  );
  const r = await pg.query(
    `UPDATE students SET biostar_row_hash = NULL WHERE "ID_Number" LIKE '${STRESS_PREFIX}%'`,
  );
  console.log(`rowsCleared=${r.rowCount}`);
  await pg.end();
}

/** Local PostgreSQL only: the next pull becomes the 24-hourly deep pass. */
async function stressForceDeep(): Promise<void> {
  const pg = await openPostgres();
  logWrite(
    'postgres',
    'update',
    [],
    'biostar_sync_state.lastFullSyncAt = NULL (force deep pass)',
  );
  const r = await pg.query(
    `UPDATE biostar_sync_state SET "lastFullSyncAt" = NULL WHERE "schemaKey" = 'dasma'`,
  );
  console.log(`stateRows=${r.rowCount}`);
  await pg.end();
}

/** Read-only. One table of every stress run, written to logs/scenario/stress-report.md. */
async function stressReport(): Promise<void> {
  const since = new Date(
    JSON.parse(fs.readFileSync(STRESS_STATE, 'utf8')).capturedAt,
  ).getTime();
  const dir = path.resolve(__dirname, '../../logs/diagnostics');
  const files = fs
    .readdirSync(dir)
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .filter(
      (x) =>
        x.t >= since &&
        (x.f.startsWith('diag_manual-') || x.f.startsWith('diag_biostar')),
    )
    .sort((a, b) => a.t - b.t);
  const lines = [
    '| file | direction | rows | timingsMs |',
    '|---|---|---|---|',
  ];
  for (const { f } of files) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const rows =
      d.direction === 'biostar-to-postgres'
        ? `fetched ${d.detailFetched}`
        : `emitted ${d.csvExport?.rowsEmitted}, csnLookups ${d.csvExport?.csnApiLookups}`;
    lines.push(
      `| ${f} | ${d.direction} | ${rows} | \`${JSON.stringify(d.timingsMs)}\` |`,
    );
  }
  const watch = path.join(SNAPSHOT_DIR, 'stress-watch.jsonl');
  if (fs.existsSync(watch))
    lines.push('', '```', fs.readFileSync(watch, 'utf8').trim(), '```');
  const out = path.join(SNAPSHOT_DIR, 'stress-report.md');
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\nwritten: ${out}`);
}

const COMMANDS: Record<string, () => Promise<void>> = {
  baseline,
  'clear-pg': clearPg,
  seed,
  state,
  'seed-extra': seedExtra,
  'rca-reactivate': rcaReactivate,
  'rca-check': rcaCheck,
  'seed-boundary': seedBoundary,
  check7,
  mutate,
  check8,
  'stress-preflight': stressPreflight,
  'stress-seed': stressSeed,
  'stress-photos': stressPhotos,
  'stress-watch': stressWatch,
  'stress-check': stressCheck,
  'stress-mutate': stressMutate,
  'stress-clear-hashes': stressClearHashes,
  'stress-force-deep': stressForceDeep,
  'stress-report': stressReport,
};

const cmd = process.argv[2];
if (!cmd || !COMMANDS[cmd]) {
  console.error(`usage: campaign.ts <${Object.keys(COMMANDS).join(' | ')}>`);
  process.exit(1);
}
COMMANDS[cmd]()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('fatal:', e?.message ?? e);
    process.exit(1);
  });
