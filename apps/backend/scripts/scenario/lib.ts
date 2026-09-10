/**
 * Shared plumbing for the live scenario harness.
 *
 * Everything here talks to the same three systems the running backend talks to,
 * using the same credentials from the repo-root `.env` and — for BioStar — the
 * same two-call attachment/import path the sync itself uses. Nothing about the
 * protocol is reinvented here, because a harness that talks to BioStar
 * differently from the sync proves nothing about the sync.
 */

import * as path from 'path';
import * as dotenv from 'dotenv';

// Same root-.env resolution as src/config/data-source.ts, adjusted for this
// file's depth (apps/backend/scripts/scenario -> ... -> repo root).
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import axios from 'axios';
import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as FormDataModule from 'form-data';

// `import * as FormData` yields the module namespace, not the class, once the
// module is loaded by a runtime that honours ES module semantics — Bun does,
// ts-node under CommonJS does not. Resolving the constructor explicitly means
// this file behaves the same under both. (scripts/biostar-probe.ts carries the
// original form and would fail the same way; its part C has never been run.)
const FormData: typeof FormDataModule =
  (FormDataModule as unknown as { default?: typeof FormDataModule }).default ??
  FormDataModule;
import * as sql from 'mssql';
import { Client } from 'pg';
import { createObjectCsvWriter } from 'csv-writer';

export const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/** Exactly the header set the Dasma path writes, in the same order. */
export const DASMA_CSV_HEADERS = [
  { id: 'user_id', title: 'user_id' },
  { id: 'name', title: 'name' },
  { id: 'department', title: 'department' },
  { id: 'user_title', title: 'user_title' },
  { id: 'user_group', title: 'user_group' },
  { id: 'remarks', title: 'Remarks' },
  { id: 'csn', title: 'csn' },
  { id: 'start_datetime', title: 'start_datetime' },
  { id: 'expiry_datetime', title: 'expiry_datetime' },
  { id: 'original_campus_entry', title: 'original_campus_entry' },
];

export const SOURCE_TABLE = 'dbo.TestTable';

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in the repo-root .env`);
  return v;
}

// ---------------------------------------------------------------- MSSQL

export async function openSource(): Promise<sql.ConnectionPool> {
  return sql.connect({
    user: requireEnv('SOURCE_DB_USERNAME'),
    password: requireEnv('SOURCE_DB_PASSWORD'),
    server: requireEnv('SOURCE_DB_HOST'),
    port: parseInt(process.env.SOURCE_DB_PORT || '1433', 10),
    database: requireEnv('SOURCE_DB_NAME'),
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 30000,
    requestTimeout: 120000,
  });
}

// ------------------------------------------------------------- PostgreSQL

export async function openPostgres(): Promise<Client> {
  const c = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: requireEnv('DB_USERNAME'),
    password: requireEnv('DB_PASSWORD'),
    database: requireEnv('DB_NAME'),
  });
  await c.connect();
  return c;
}

// ---------------------------------------------------------------- BioStar

export interface BiostarSession {
  baseUrl: string;
  headers: Record<string, string>;
}

export async function openBiostar(): Promise<BiostarSession> {
  const baseUrl = requireEnv('BIOSTAR_API_BASE_URL');
  const res = await axios.post(
    `${baseUrl}/api/login`,
    {
      User: {
        login_id: requireEnv('BIOSTAR_API_LOGIN_ID'),
        password: requireEnv('BIOSTAR_API_PASSWORD'),
      },
    },
    { headers: { 'Content-Type': 'application/json' }, httpsAgent },
  );
  const sessionId = res.headers['bs-session-id'];
  if (!sessionId) throw new Error('BioStar login returned no bs-session-id');
  return {
    baseUrl,
    headers: {
      Authorization: `Bearer ${res.data?.token}`,
      'bs-session-id': sessionId,
      accept: 'application/json',
    },
  };
}

export async function listBiostarUsers(
  s: BiostarSession,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 500;
  for (;;) {
    const res = await axios.get(
      `${s.baseUrl}/api/users?limit=${limit}&offset=${offset}`,
      { headers: s.headers, httpsAgent, timeout: 120000 },
    );
    const rows = res.data?.UserCollection?.rows ?? [];
    out.push(...rows);
    const total = parseInt(String(res.data?.UserCollection?.total ?? 0), 10);
    offset += limit;
    if (rows.length === 0 || offset >= total) break;
  }
  return out;
}

/** Returns the user detail, or null when BioStar does not have that id. */
export async function getBiostarUser(
  s: BiostarSession,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const res = await axios.get(
    `${s.baseUrl}/api/users/${encodeURIComponent(userId)}`,
    {
      headers: s.headers,
      httpsAgent,
      timeout: 30000,
      validateStatus: () => true,
    },
  );
  if (res.status !== 200) return null;
  return (res.data?.User ?? res.data) as Record<string, unknown>;
}

/**
 * Deletes users through the same call `database-sync.service.ts:925` makes —
 * ids percent-encoded and joined with `%2B`, group in the query string. A
 * different delete shape here would be one more thing that is only true of the
 * harness.
 */
export async function deleteBiostarUsers(
  s: BiostarSession,
  userIds: string[],
): Promise<{ status: number; data: unknown }> {
  if (userIds.length === 0) return { status: 200, data: null };
  const formattedIds = userIds.map((id) => encodeURIComponent(id)).join('%2B');
  const res = await axios.delete(
    `${s.baseUrl}/api/users?id=${formattedIds}&group_id=1`,
    {
      headers: s.headers,
      httpsAgent,
      timeout: 60000,
      validateStatus: () => true,
    },
  );
  return { status: res.status, data: res.data };
}

export interface CsvRow {
  user_id: string;
  name: string;
  department?: string;
  user_title?: string;
  user_group?: string;
  remarks?: string;
  csn?: string;
  start_datetime?: string;
  expiry_datetime?: string;
  original_campus_entry?: string;
}

/**
 * Imports rows through the exact two calls the sync makes — POST /api/attachments
 * then POST /api/users/csv_import with `import_option: 2` (Overwrite).
 */
export async function importCsv(
  s: BiostarSession,
  rows: CsvRow[],
): Promise<unknown> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dasma-scenario-'));
  const csvPath = path.join(tempDir, 'scenario.csv');
  const writer = createObjectCsvWriter({
    path: csvPath,
    header: DASMA_CSV_HEADERS,
  });
  await writer.writeRecords(
    rows.map((r) => ({
      department: 'DLSU',
      user_title: 'Student',
      user_group: 'All Users',
      remarks: '',
      csn: '',
      start_datetime: '2001-01-01 00:00:00.000',
      expiry_datetime: '2030-12-31 23:59:00.000',
      original_campus_entry: 'Y',
      ...r,
    })),
  );

  const form = new FormData();
  form.append('file', fs.createReadStream(csvPath));
  const upload = await axios.post(`${s.baseUrl}/api/attachments`, form, {
    headers: { ...form.getHeaders(), ...s.headers },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    httpsAgent,
    timeout: 120000,
  });
  const uploadedFileName = upload.data?.filename;
  if (!uploadedFileName)
    throw new Error('no filename returned from /api/attachments');

  const headerLine = fs.readFileSync(csvPath, 'utf8').split('\n')[0];
  const headers = headerLine.split(',');
  const res = await axios.post(
    `${s.baseUrl}/api/users/csv_import`,
    {
      File: { uri: uploadedFileName, fileName: uploadedFileName },
      CsvOption: {
        columns: {
          total: headers.length.toString(),
          rows: headers,
          formats: headers.map(() => 'Text'),
        },
        start_line: 2,
        import_option: 2,
      },
      Query: { headers, columns: headers },
    },
    {
      headers: { 'Content-Type': 'application/json', ...s.headers },
      httpsAgent,
      timeout: 120000,
    },
  );
  fs.rmSync(tempDir, { recursive: true, force: true });
  return res.data;
}

/** Writes one field on a BioStar user via the documented partial PUT. */
export async function putUser(
  s: BiostarSession,
  userId: string,
  user: Record<string, unknown>,
): Promise<unknown> {
  const res = await axios.put(
    `${s.baseUrl}/api/users/${encodeURIComponent(userId)}`,
    { User: user },
    {
      headers: { 'Content-Type': 'application/json', ...s.headers },
      httpsAgent,
      timeout: 60000,
      validateStatus: () => true,
    },
  );
  return { status: res.status, data: res.data };
}

// ------------------------------------------------------------------ output

export const SNAPSHOT_DIR = path.resolve(__dirname, '../../logs/scenario');

export function writeSnapshot(name: string, payload: unknown): string {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const file = path.join(SNAPSHOT_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

export function readSnapshot<T>(name: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(SNAPSHOT_DIR, `${name}.json`), 'utf8'),
  ) as T;
}

export function banner(title: string): void {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

// ------------------------------------------------------- the running app

/**
 * Drives the sync through the running backend's own HTTP API rather than by
 * booting a second Nest context.
 *
 * That is deliberate. `studentMutationLock` in `database-sync.service.ts` is an
 * in-process promise chain, so a second process mutating `students` would not
 * bypass a lock so much as fail to see one at all — `core/safety.md` invariant 1.
 * Going through the running app means every sync this harness triggers queues
 * behind the same lock as a sync triggered from the dashboard.
 *
 * Credentials come from the environment, never from a file in the repo:
 *   SYNC_ADMIN_USER=... SYNC_ADMIN_PASSWORD=... bun ... run.ts sync <label>
 */
export async function loginToApp(): Promise<{
  baseUrl: string;
  token: string;
}> {
  const baseUrl = process.env.APP_BASE_URL || 'http://127.0.0.1:10580';
  const username = requireEnv('SYNC_ADMIN_USER');
  const password = requireEnv('SYNC_ADMIN_PASSWORD');
  const res = await axios.post(
    `${baseUrl}/auth/login`,
    { username, password },
    { timeout: 30000, validateStatus: () => true },
  );
  // The controller answers 201, not 200 — it is a @Post with no @HttpCode —
  // and hands back a token that ALREADY carries the "Bearer " prefix. Strip it
  // so callers can add it themselves without producing "Bearer Bearer ey...".
  if (res.status >= 400 || !res.data?.access_token) {
    throw new Error(
      `login failed: ${res.status} ${JSON.stringify(res.data)?.slice(0, 200)}`,
    );
  }
  const raw = String(res.data.access_token);
  return { baseUrl, token: raw.replace(/^Bearer\s+/i, '') };
}

/** Waits for the queue row the trigger just created to leave `processing`. */
async function waitForQueue(since: Date, timeoutMs = 600000): Promise<string> {
  const pg = await openPostgres();
  try {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const r = await pg.query(
        `SELECT status FROM sync_queue WHERE "createdAt" >= $1
         ORDER BY "createdAt" DESC LIMIT 1`,
        [since],
      );
      const status = r.rows[0]?.status;
      if (status === 'completed' || status === 'failed') return status;
      if (Date.now() > deadline)
        return `timed out (last status: ${status ?? 'none'})`;
      await new Promise((r2) => setTimeout(r2, 2000));
    }
  } finally {
    await pg.end();
  }
}

/** Triggers the roster sync (source -> PostgreSQL -> BioStar) and waits. */
export async function runRosterSync(): Promise<string> {
  const { baseUrl, token } = await loginToApp();
  const since = new Date(Date.now() - 2000);
  const res = await axios.post(
    `${baseUrl}/database-sync/sync`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 60000,
      validateStatus: () => true,
    },
  );
  if (res.status >= 400) {
    throw new Error(
      `sync trigger failed: ${res.status} ${JSON.stringify(res.data)}`,
    );
  }
  return waitForQueue(since);
}

/** Triggers the inbound BioStar -> PostgreSQL pull. */
export async function runBiostarSync(): Promise<unknown> {
  const { baseUrl, token } = await loginToApp();
  const res = await axios.post(
    `${baseUrl}/database-sync/biostar/sync`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 600000,
      validateStatus: () => true,
    },
  );
  return { status: res.status, data: res.data };
}

/** The newest diagnostics file for a given sync direction. */
export function newestDiagnostics(direction: string): unknown | null {
  const dir = path.resolve(__dirname, '../../logs/diagnostics');
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(0, 12)) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (j.direction === direction) return { file: f, ...j };
  }
  return null;
}
