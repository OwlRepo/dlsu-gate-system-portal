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

const COMMANDS: Record<string, () => Promise<void>> = {
  baseline,
  'clear-pg': clearPg,
  seed,
  state,
  'seed-extra': seedExtra,
  'rca-reactivate': rcaReactivate,
  'rca-check': rcaCheck,
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
